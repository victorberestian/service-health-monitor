import { strict as assert } from 'assert';
import { Broker } from '../../../src/broker';
import { WindowManager } from '../../../src/window-manager';
import { HealthMonitorService } from '../../../src/health/services';
import { listenHealthDashboard, HEALTH_WINDOW_ID } from '../../../src/health/subscribers/HealthDashboard';
import { HealthTopicsEnum, IHealthSnapshot, IStatusChangedPayload } from '../../../src/health/interfaces';

describe('listenHealthDashboard', () => {
    let broker: Broker;
    let windowManager: WindowManager;
    let monitor: HealthMonitorService;
    let dispose: () => void;

    beforeEach(() => {
        broker = new Broker();
        windowManager = new WindowManager(broker);
        monitor = new HealthMonitorService(broker);
        dispose = listenHealthDashboard(broker, windowManager, monitor);
    });

    afterEach(() => {
        dispose();
        monitor.destroy();
    });

    describe('OPEN_DASHBOARD', () => {
        it('creates and shows the health window', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);
            assert.equal(state.visible, true);
        });

        it('sends the current snapshot to the window on open', () => {
            monitor.register('svc-a');
            monitor.register('svc-b');

            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const snapshotMessage = state.messageLog.find(
                (m) => m.topic === HealthTopicsEnum.SNAPSHOT_REPLY
            );
            assert.ok(snapshotMessage !== undefined);

            const snapshot = snapshotMessage.payload as IHealthSnapshot;
            assert.equal(snapshot.services.length, 2);
        });

        it('is idempotent — window is only created once on repeated opens', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            // If createWindow were called twice it would reset messageLog,
            // but the snapshot should have been sent twice (once per open)
            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const snapshots = state.messageLog.filter(
                (m) => m.topic === HealthTopicsEnum.SNAPSHOT_REPLY
            );
            assert.equal(snapshots.length, 2);
        });

        it('sends an empty services array when no services are registered', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const snapshotMessage = state.messageLog.find(
                (m) => m.topic === HealthTopicsEnum.SNAPSHOT_REPLY
            );
            assert.ok(snapshotMessage !== undefined);

            const snapshot = snapshotMessage.payload as IHealthSnapshot;
            assert.equal(snapshot.services.length, 0);
        });
    });

    describe('STATUS_CHANGED forwarding', () => {
        it('forwards status changes to the window after it is opened', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            monitor.register('svc');
            monitor.markStarting('svc');

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const statusMessage = state.messageLog.find(
                (m) => m.topic === HealthTopicsEnum.STATUS_CHANGED
            );
            assert.ok(statusMessage !== undefined);

            const payload = statusMessage.payload as IStatusChangedPayload;
            assert.equal(payload.serviceName, 'svc');
        });

        it('does not forward status changes before the window is opened', () => {
            monitor.register('svc');
            monitor.markStarting('svc');

            // Window not opened yet — no window state at all
            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.equal(state, undefined);
        });

        it('window receives multiple status changes in order', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            monitor.register('svc');
            monitor.markStarting('svc');
            monitor.markHealthy('svc');

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const statusMessages = state.messageLog.filter(
                (m) => m.topic === HealthTopicsEnum.STATUS_CHANGED
            );
            assert.equal(statusMessages.length, 2);

            const [first, second] = statusMessages.map((m) => m.payload as IStatusChangedPayload);
            assert.equal(first.currentState, 'STARTING');
            assert.equal(second.currentState, 'HEALTHY');
        });
    });

    describe('dispose', () => {
        it('stops forwarding status changes after dispose', () => {
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.ok(state !== undefined);

            const messagesBefore = state.messageLog.length;

            dispose();

            monitor.register('svc');
            monitor.markStarting('svc');

            assert.equal(state.messageLog.length, messagesBefore);
        });

        it('stops reacting to OPEN_DASHBOARD after dispose', () => {
            dispose();
            broker.send(HealthTopicsEnum.OPEN_DASHBOARD);

            const state = windowManager.getWindowState(HEALTH_WINDOW_ID);
            assert.equal(state, undefined);
        });
    });
});
