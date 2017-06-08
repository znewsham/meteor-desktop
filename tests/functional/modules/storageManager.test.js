import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import path from 'path';
import fs from 'fs';
import shell from 'shelljs';
import asar from 'asar';
import mockery from 'mockery';

import paths from '../../helpers/paths';
import { getFakeLogger } from '../../helpers/meteorDesktop';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

const Electron = { app: { getPath: () => paths.storagesPath}};

let StorageManager;
describe('storageManager', () => {

    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false
        });
        StorageManager = require('../../../skeleton/modules/storageManager');
        StorageManager = StorageManager.default;

    });

    after(() => {
        mockery.deregisterMock('electron');
        mockery.disable();
    });

    beforeEach(() => {
        shell.mkdir(paths.testsTmpPath);
        shell.cp('-rf', paths.fixtures.storages, paths.storagesPath);

    });

    afterEach(() => {
        //shell.rm('-rf', paths.storagesPath);
    });

    describe('#storageManager', () => {
        it('test', () => {
            const storageManager = new StorageManager({
                log: getFakeLogger(true, true),
                appSettings: {},
                // fake systemEvents
                eventsBus: {
                    on() {
                    }
                }
            });

            storageManager.manage(57207);

        });
    });


});
