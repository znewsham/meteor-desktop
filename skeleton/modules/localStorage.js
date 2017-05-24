import shelljs from 'shelljs';
import { app } from 'electron';
import fs from 'fs-plus';
import fse from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';

/**
 * Utility to manage Chrome's local storage files.
 * Its purpose is to preserve local storage data even though every time the app starts a
 * different port is used and a new blank local storage file is created.
 * It tries to achieve that just by manipulating the files (copying/renaming/deleting).
 *
 * !This is a temporary solution before architecture change in 1.0!
 *
 * @constructor
 */
export default class LocalStorage {

    constructor({ log, eventsBus }) {
        const appPath = app.getPath('userData');

        this.log = log;
        this.localStoragePath = path.join(appPath, 'Local Storage');
        this.filePrefix = 'http_127.0.0.1_';

        this.storagePath = port =>
            path.join(this.localStoragePath, `${this.filePrefix}${port}.localstorage`);
        this.storageJournalPath = port =>
            path.join(this.localStoragePath, `${this.filePrefix}${port}.localstorage-journal`);

        eventsBus.on('beforeLoadUrl', (port, lastPort = null) => this.prepare(port, lastPort));

        this.portMatcher = /(?:\.\d+)_(\d+)/g;
    }

    /**
     * Traverses the local storage directory looking for the last modified local storage file.
     *
     * @returns {{latestPort: number, files: Array}}
     */
    findLatestLocalStorageFile() {
        let maxMTime = 0;
        let latestPort = 0;
        let files = [];

        if (fs.existsSync(this.localStoragePath)) {
            files = shelljs.ls('-l', this.localStoragePath);

            files.forEach((file) => {
                if (file.name.startsWith(this.filePrefix)) {
                    const matchResult = this.portMatcher.exec(file);

                    if (matchResult.length >= 2) {
                        const localPort = parseInt(matchResult[1], 10);
                        if (localPort > 0 && localPort < 60000 && file.mtime.getTime() > maxMTime) {
                            latestPort = localPort;
                            maxMTime = file.mtime.getTime();
                        }
                    }
                }
            });
        }

        return { latestPort, files };
    }

    rimrafPromisfied(filePath) {
        return new Promise((resolve, reject) => {
            rimraf(filePath, {}, (error) => {
                if (error) {
                    this.log.debug(`could not remove ${filePath}`);
                    reject(error);
                } else {
                    this.log.debug(`removed ${filePath}`);
                    resolve();
                }
            });
        });
    }

    removeFilesIfPresent(paths) {
        const rimrafPromises = [];
        paths.forEach((filePath) => {
            if (fs.existsSync(filePath)) {
                rimrafPromises.push(this.rimrafPromisfied(filePath));
            } else {
                rimrafPromises.push(Promise.resolve());
            }
        });
        return Promise.all(rimrafPromises);
    }

    static copyOrMoveFiles(operation, paths) {
        const ioPromises = [];
        paths.forEach((filePaths) => {
            ioPromises.push(LocalStorage.ioOperationWithRetries(operation, ...filePaths));
        });
        return Promise.all(ioPromises);
    }

    /**
     * Simple wrapper for copy/move with additional retries in case of failure.
     * It is useful when something is concurrently accessing the files you want to modify.
     */
    static ioOperationWithRetries(operation, ...args) {
        let retries = 0;
        return new Promise((resolve, reject) => {
            function io() {
                fse[operation](...args)
                    .then(() => {
                        resolve(true);
                    })
                    .catch((err) => {
                        retries += 1;
                        if (retries < 5) {
                            setTimeout(() => {
                                io(operation, ...args);
                            }, 100);
                        } else {
                            reject(err);
                        }
                    });
            }
            io(operation, ...args);
        });
    }

    /**
     * Renames the newest local storage in a way to make Chrome load it for the current url.
     *
     * @param {number} port     - port on which the meteor app is going to be served
     * @param {number} lastPort - port on which the meteor app was served previously
     */
    prepare(port, lastPort = null) {
        const { latestPort, files } = this.findLatestLocalStorageFile();

        if (latestPort === 0) return Promise.resolve();

        if (latestPort !== port) {
            const involvedFiles = [
                this.storagePath(port),
                this.storageJournalPath(port),
                this.storagePath(latestPort),
                this.storageJournalPath(latestPort)
            ];

            return new Promise((resolve, reject) => {
                // Delete the files for the current port if they exist.
                this.removeFilesIfPresent(involvedFiles.slice(0, 2))
                    .catch((error) => {
                        this.log.error('could not delete old local storage file, aborting, the' +
                            ` storage may be outdated: ${error}`);
                        throw new Error('skip');
                    })
                    .then(() => {
                        // When we have information about last port this is probably the case when
                        // HCP refresh is being made. In this case it is safer to copy instead of
                        // moving as the files might be in use.
                        const operation = lastPort !== null ? 'copy' : 'move';

                        return LocalStorage.copyOrMoveFiles(operation, [
                            [involvedFiles[2], involvedFiles[0]],
                            [involvedFiles[3], involvedFiles[1]]
                        ]);
                    })
                    .catch((error) => {
                        if (error.message !== 'skip') {
                            this.log.error('could not copy/move local storage files, aborting, the' +
                                ` storage may be outdated: ${error}`);
                        }
                        throw new Error('skip');
                    })
                    .then((result) => {
                        if (result.every(v => v)) {
                            this.log.verbose(`storage from port ${latestPort} migrated to ${port}`);
                        }
                        return LocalStorage.removeFilesIfPresent(involvedFiles.slice(2));
                    })
                    .catch((error) => { // eslint-disable-line
                        if (error.message !== 'skip') {
                            this.log.warning('could not delete redundant local storage files' +
                                ` however this should not have any side effects: ${error}`);
                        } else {
                            reject();
                            return 'error';
                        }
                    })
                    .then((error) => {
                        this.deleteOthers(port, lastPort, files);
                        if (error !== 'error') {
                            resolve();
                        }
                    });
            });
        }

        return new Promise((resolve) => {
            this.deleteOthers(port, lastPort, files);
            this.log.verbose('port did not change, no migration needed');
            resolve();
        });
    }

    /**
     * Deletes all local storage files that are not for the current and last port.
     *
     * @param {number} port     - port on which the meteor app is going to be served
     * @param {number} lastPort - port on which the meteor app was served previously
     * @param {Array} files     - array with local storage files
     */
    deleteOthers(port, lastPort, files) {
        files.forEach((file) => {
            if (file.name.startsWith(this.filePrefix) && !~file.name.indexOf(port) &&
                (lastPort === null || (lastPort !== null && !~file.name.indexOf(lastPort)))
            ) {
                const filePath = path.join(this.localStoragePath, file.name);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        // No harm...
                    }
                }
            }
        });
    }
}
