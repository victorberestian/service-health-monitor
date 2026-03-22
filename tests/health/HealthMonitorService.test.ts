import { strict as assert } from 'assert';
import sinon from 'sinon';
import { Broker } from '../../src/broker';
import { HealthMonitorService } from '../../src/health/services/HealthMonitorService';
import {
    ServiceStateEnum,
    HealthTopicsEnum,
    IStatusChangedPayload,
    IHealthSnapshot
} from '../../src/health/interfaces';

describe('HealthMonitorService', () => {
    let clock: sinon.SinonFakeTimers;
    let broker: Broker;
    let monitor: HealthMonitorService;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        broker = new Broker();
        monitor = new HealthMonitorService(broker, { heartbeatTimeoutMs: 1000 });
    });

    afterEach(() => {
        monitor.destroy();
        clock.restore();
    });

    // ---- register() ----

    describe('register()', () => {
        it('creates the service in REGISTERED state with null heartbeat and error', () => {
            monitor.register('svc');

            const { services } = monitor.getSnapshot();
            assert.equal(services.length, 1);
            assert.equal(services[0].name, 'svc');
            assert.equal(services[0].state, ServiceStateEnum.REGISTERED);
            assert.equal(services[0].lastHeartbeat, null);
            assert.equal(services[0].lastError, null);
        });

        it('is idempotent — second call does not reset state', () => {
            monitor.register('svc');
            monitor.markStarting('svc');
            monitor.register('svc');

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.STARTING);
        });
    });

    // ---- markStarting() ----

    describe('markStarting()', () => {
        it('transitions REGISTERED → STARTING and emits STATUS_CHANGED', () => {
            monitor.register('svc');

            const changes: IStatusChangedPayload[] = [];
            broker.on<IStatusChangedPayload>(HealthTopicsEnum.STATUS_CHANGED, (p) => changes.push(p));

            monitor.markStarting('svc');

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.STARTING);
            assert.equal(changes.length, 1);
            assert.equal(changes[0].previousState, ServiceStateEnum.REGISTERED);
            assert.equal(changes[0].currentState, ServiceStateEnum.STARTING);
        });

        it('is a no-op when service is already past REGISTERED', () => {
            monitor.register('svc');
            monitor.markStarting('svc');

            const changes: IStatusChangedPayload[] = [];
            broker.on<IStatusChangedPayload>(HealthTopicsEnum.STATUS_CHANGED, (p) => changes.push(p));

            monitor.markStarting('svc');

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.STARTING);
            assert.equal(changes.length, 0);
        });

        it('is a no-op for an unknown service', () => {
            assert.doesNotThrow(() => monitor.markStarting('unknown'));
        });
    });

    // ---- markHealthy() ----

    describe('markHealthy()', () => {
        it('transitions to HEALTHY and sets lastHeartbeat', () => {
            monitor.register('svc');
            monitor.markStarting('svc');
            monitor.markHealthy('svc');

            const { services } = monitor.getSnapshot();
            assert.equal(services[0].state, ServiceStateEnum.HEALTHY);
            assert.notEqual(services[0].lastHeartbeat, null);
        });

        it('does not emit STATUS_CHANGED when already HEALTHY', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');

            const changes: IStatusChangedPayload[] = [];
            broker.on<IStatusChangedPayload>(HealthTopicsEnum.STATUS_CHANGED, (p) => changes.push(p));

            monitor.markHealthy('svc');

            assert.equal(changes.length, 0);
        });
    });

    // ---- markFailed() ----

    describe('markFailed()', () => {
        it('transitions to FAILED and stores the error message', () => {
            monitor.register('svc');
            monitor.markFailed('svc', 'boom');

            const { services } = monitor.getSnapshot();
            assert.equal(services[0].state, ServiceStateEnum.FAILED);
            assert.equal(services[0].lastError, 'boom');
        });

        it('transitions to FAILED without an error message', () => {
            monitor.register('svc');
            monitor.markFailed('svc');

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.FAILED);
        });

        it('is a no-op for an unknown service', () => {
            assert.doesNotThrow(() => monitor.markFailed('unknown', 'err'));
        });
    });

    // ---- heartbeat via broker ----

    describe('heartbeat (via broker)', () => {
        it('STARTING → HEALTHY on first heartbeat', () => {
            monitor.register('svc');
            monitor.markStarting('svc');

            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.HEALTHY);
        });

        it('UNRESPONSIVE → HEALTHY on heartbeat', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');
            clock.tick(1001);
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.UNRESPONSIVE);

            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.HEALTHY);
        });

        it('UNHEALTHY stays UNHEALTHY on heartbeat but resets watchdog', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');
            broker.send(HealthTopicsEnum.ERROR_REPORT, { serviceName: 'svc', error: 'oops' });
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.UNHEALTHY);

            const changes: IStatusChangedPayload[] = [];
            broker.on<IStatusChangedPayload>(HealthTopicsEnum.STATUS_CHANGED, (p) => changes.push(p));

            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.UNHEALTHY);
            assert.equal(changes.length, 0);
        });

        it('ignores heartbeat for REGISTERED service', () => {
            monitor.register('svc');
            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.REGISTERED);
        });

        it('ignores heartbeat for FAILED service', () => {
            monitor.register('svc');
            monitor.markFailed('svc', 'err');
            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.FAILED);
        });

        it('ignores heartbeat for unknown service', () => {
            assert.doesNotThrow(() => broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'ghost' }));
        });
    });

    // ---- error report via broker ----

    describe('error report (via broker)', () => {
        it('HEALTHY → UNHEALTHY on error report, stores error', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');

            broker.send(HealthTopicsEnum.ERROR_REPORT, { serviceName: 'svc', error: 'disk full' });

            const { services } = monitor.getSnapshot();
            assert.equal(services[0].state, ServiceStateEnum.UNHEALTHY);
            assert.equal(services[0].lastError, 'disk full');
        });

        it('ignores error report for REGISTERED service', () => {
            monitor.register('svc');
            broker.send(HealthTopicsEnum.ERROR_REPORT, { serviceName: 'svc', error: 'err' });
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.REGISTERED);
        });

        it('ignores error report for FAILED service', () => {
            monitor.register('svc');
            monitor.markFailed('svc', 'initial');
            broker.send(HealthTopicsEnum.ERROR_REPORT, { serviceName: 'svc', error: 'new error' });
            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.FAILED);
            assert.equal(monitor.getSnapshot().services[0].lastError, 'initial');
        });
    });

    // ---- watchdog timer ----

    describe('watchdog timer', () => {
        it('HEALTHY → UNRESPONSIVE after timeout with no heartbeat', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');

            clock.tick(1001);

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.UNRESPONSIVE);
        });

        it('UNHEALTHY → UNRESPONSIVE after timeout with no heartbeat', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');
            broker.send(HealthTopicsEnum.ERROR_REPORT, { serviceName: 'svc', error: 'err' });

            clock.tick(1001);

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.UNRESPONSIVE);
        });

        it('heartbeat before timeout resets the watchdog', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');

            clock.tick(800);
            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });
            clock.tick(800); // 1600ms total, but timer was reset at 800ms

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.HEALTHY);
        });

        it('FAILED service is not affected by a running timer', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');
            monitor.markFailed('svc', 'crash');

            clock.tick(2000);

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.FAILED);
        });
    });

    // ---- snapshot request via broker ----

    describe('SNAPSHOT_REQUEST (via broker)', () => {
        it('replies on SNAPSHOT_REPLY with all registered services', () => {
            monitor.register('svc-a');
            monitor.register('svc-b');
            monitor.markHealthy('svc-a');

            let reply: IHealthSnapshot | undefined;
            broker.on<IHealthSnapshot>(HealthTopicsEnum.SNAPSHOT_REPLY, (s) => { reply = s; });
            broker.send(HealthTopicsEnum.SNAPSHOT_REQUEST);

            assert.ok(reply !== undefined);
            assert.equal(reply.services.length, 2);
        });

        it('snapshot timestamp is set', () => {
            monitor.register('svc');
            let reply: IHealthSnapshot | undefined;
            broker.on<IHealthSnapshot>(HealthTopicsEnum.SNAPSHOT_REPLY, (s) => { reply = s; });
            broker.send(HealthTopicsEnum.SNAPSHOT_REQUEST);

            assert.ok(reply !== undefined);
            assert.equal(typeof reply.timestamp, 'number');
        });
    });

    // ---- destroy() ----

    describe('destroy()', () => {
        it('stops processing heartbeats after destroy', () => {
            monitor.register('svc');
            monitor.markStarting('svc');
            monitor.destroy();

            broker.send(HealthTopicsEnum.HEARTBEAT, { serviceName: 'svc' });

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.STARTING);
        });

        it('clears pending timers so watchdog does not fire after destroy', () => {
            monitor.register('svc');
            monitor.markHealthy('svc');
            monitor.destroy();

            clock.tick(2000);

            assert.equal(monitor.getSnapshot().services[0].state, ServiceStateEnum.HEALTHY);
        });
    });
});
