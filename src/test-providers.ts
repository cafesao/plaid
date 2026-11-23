import {ElectronService} from './plaid/core/electron.service';
import {ElectronService as ElectronServiceMock} from './__mocks__/electron.service';

// Providers added to every TestBed (angular.json → test.options.providersFile).
// Tests never talk to the real Electron bridge: ElectronService is replaced by the mock, as Jest's moduleNameMapper did.
export default [{provide: ElectronService, useClass: ElectronServiceMock}];
