/* eslint-disable no-underscore-dangle, global-require, no-unused-vars */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it, before, after } = global;
const { expect } = chai;

const Electron = { app: { getPath: () => '/path' } };

let LocalStorage;

describe('LocalStorage', () => {
    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false
        });
        LocalStorage = require('../../../skeleton/modules/localStorage');
        LocalStorage = LocalStorage.default;
    });

    after(() => {
        process.env.METEOR_DESKTOP_UNIT_TEST = false;
        mockery.deregisterMock('electron');
        mockery.disable();
    });

    describe('#constructor', () => {
        it('should hook to beforeLoadUrl', () => {
            const stub = sinon.stub();
            const localStorage = new LocalStorage({ log: {}, eventsBus: { on: stub } });
            expect(stub).to.be.calledWith(sinon.match('beforeLoadUrl'), sinon.match.func);
        });
    });

    describe('#prepare', () => {
        it('should resolve when no localstorage files were found', () => {
            const localStorage =
                new LocalStorage({ log: {}, eventsBus: { on: Function.prototype } });
            localStorage.findLatestLocalStorageFile = () => ({ latestPort: 0, files: [] });
            return localStorage.prepare();
        });
    });

});

