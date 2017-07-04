import shelljs from 'shelljs';
import { app } from 'electron';
import fs from 'fs-plus';
import fse from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';
import { findNewestFileOrDirectory, removePaths, rimrafPromisfied } from './storageManager/ioHelper';

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

    manage(port, lastPort = null) {
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

            const targetPaths = storage.pathGenerators.map(pathGenerator => path.join(storage.path, pathGenerator(port)));
            console.log('targetPaths', targetPaths);

            removePaths(targetPaths, rimrafPromisfied)
                .catch((error) => {
                    console.log(error);
                })
                .then(() => {
                    resolve();
                });

            /*
            this.removeFilesIfPresent(involvedFiles.slice(0, 2))
                .catch((error) => {
                    this.log.error('could not delete old local storage file, aborting, the' +
                        ` storage may be outdated: ${error}`);
                    throw new Error('skip');
                })
                .then(() => {
                resolve();
                });
                */

        });
    }
}
