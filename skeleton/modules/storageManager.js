import shelljs from 'shelljs';
import { app } from 'electron';
import fs from 'fs-plus';
import fse from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';
import { findNewestFileOrDirectory, removePaths, rimrafPromisfied, ioOperationWithRetries, batchIoOperationWithRetries } from './storageManager/ioHelper';

class Storage {
    constructor(dir) {
        const appPath = app.getPath('userData');
        this.path = path.join(appPath, dir);
        this.entryPrefix = 'http_127.0.0.1_';
        this.pathGenerators = [];
        this.entryFilter = file => file.name.startsWith(this.entryPrefix);
    }
}

class LocalStorage extends Storage {
    constructor() {
        super('Local Storage');
        const storagePath = port => `${this.entryPrefix}${port}.localstorage`;
        const storageJournalPath = port => `${this.entryPrefix}${port}.localstorage-journal`;

        this.pathGenerators = [storagePath, storageJournalPath];


    }
}

class IndexedDbStorage extends Storage {

    constructor() {
        super('IndexedDB');
        this.pathGenerators = [
            port => `${this.entryPrefix}${port}.indexeddb.leveldb`
        ]

    }
}

/**
 * @constructor
 */
export default class StorageManager {

    constructor({ log, eventsBus }) {


        this.log = log;

        this.storages = [
            new LocalStorage(),
            new IndexedDbStorage()
        ];

        eventsBus.on('beforeLoadUrl', (port, lastPort = null) => this.manage(port, lastPort));

        this.portMatcher = /(?:\.\d+)_(\d+)/g;
    }

    manage(port, lastPort) {
        const promises = [];
        this.storages.forEach(storage => {
            promises.push(this.manageSingleStorage(storage, port));
        });

        return Promise.all(promises);
    }

    manageSingleStorage(storage, port) {

        return new Promise((resolve, reject) => {
            const { entries, newest } = findNewestFileOrDirectory(storage.path, storage.entryFilter);
            console.log('newest', newest);

            if (newest === null) {
                return resolve();
            }

            const portMatcherResult = this.portMatcher.exec(newest);
            this.portMatcher.lastIndex = 0;
            const newestPort = portMatcherResult[1];

            // If the newest data are already for the port we want to use then we are fine, no need
            // to make any changes. This should be the normal scenario.
            if (newestPort === port) {
                return resolve();
            }

            const targetPaths = storage.pathGenerators.map(pathGenerator => path.join(storage.path, pathGenerator(port)));
            console.log('targetPaths', targetPaths);



            const sourcePaths = storage.pathGenerators.map(pathGenerator => path.join(storage.path, pathGenerator(newestPort)));

            const moveArguments = [];
            sourcePaths.forEach((sourcePath, index) => {
                moveArguments.push([sourcePath, targetPaths[index]]);
            });
            console.log(moveArguments);

            removePaths(targetPaths, rimrafPromisfied)
                .catch((error) => {
                    console.log(error);
                })
                .then(() => {
                    return batchIoOperationWithRetries('move', undefined, undefined, ioOperationWithRetries, moveArguments);

                })
            .catch((error) => {
                console.log(error);
            })
                .then(() => {
                    resolve();

                });

        });
    }
}
