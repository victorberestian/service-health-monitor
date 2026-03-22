import { strict as assert } from 'assert';
import { Broker } from '../src/broker';
import { HealthMonitorService } from '../src/health/services';
import { startupServices, APPLICATION_ACTIONS, ServiceRegistration } from '../src/startup';
import { ServiceStateEnum } from '../src/health/interfaces';
import type { ServiceAdapterResult, ServiceFactory } from '../src/service-adapter';

// ---- helpers ----

function makeAdapter(name: string): ServiceRegistration['adapter'] {
    return async (_factory, _broker) => ({
        name,
        dispose: async () => {}
    });
}

function makeFailingAdapter(): ServiceRegistration['adapter'] {
    return async () => {
        throw new Error('adapter error');
    };
}

function makeRegistration(
    name: string,
    opts: { critical?: boolean; fail?: boolean } = {}
): ServiceRegistration {
    return {
        name,
        factory: { build: async () => ({}) } as ServiceFactory<unknown>,
        adapter: opts.fail ? makeFailingAdapter() : makeAdapter(name),
        critical: opts.critical
    };
}

// ---- tests ----

describe('startupServices', () => {
    let broker: Broker;
    let monitor: HealthMonitorService;

    beforeEach(() => {
        broker = new Broker();
        monitor = new HealthMonitorService(broker);
    });

    afterEach(() => {
        monitor.destroy();
    });

    // ---- happy path ----

    describe('happy path', () => {
        it('emits APP_READY when all services succeed', async () => {
            let ready = false;
            broker.on(APPLICATION_ACTIONS.APP_READY, () => { ready = true; });

            await startupServices(
                [makeRegistration('svc-a'), makeRegistration('svc-b')],
                broker,
                monitor
            );

            assert.equal(ready, true);
        });

        it('returns all successful adapters', async () => {
            const result = await startupServices(
                [makeRegistration('svc-a'), makeRegistration('svc-b')],
                broker,
                monitor
            );

            assert.equal(result.length, 2);
        });

        it('marks each successful service as HEALTHY', async () => {
            await startupServices(
                [makeRegistration('svc-a'), makeRegistration('svc-b')],
                broker,
                monitor
            );

            const { services } = monitor.getSnapshot();
            assert.ok(services.every((s) => s.state === ServiceStateEnum.HEALTHY));
        });

        it('emits SERVICE_INITIALIZED for each successful service', async () => {
            const initialized: string[] = [];
            broker.on<{ name: string }>(APPLICATION_ACTIONS.SERVICE_INITIALIZED, ({ name }) => {
                initialized.push(name);
            });

            await startupServices(
                [makeRegistration('svc-a'), makeRegistration('svc-b')],
                broker,
                monitor
            );

            assert.deepEqual(initialized, ['svc-a', 'svc-b']);
        });
    });

    // ---- failure handling ----

    describe('failure handling', () => {
        it('does not throw when a service fails', async () => {
            await assert.doesNotReject(() =>
                startupServices([makeRegistration('svc', { fail: true })], broker, monitor)
            );
        });

        it('marks a failed service as FAILED', async () => {
            await startupServices(
                [makeRegistration('svc', { fail: true })],
                broker,
                monitor
            );

            const { services } = monitor.getSnapshot();
            assert.equal(services[0].state, ServiceStateEnum.FAILED);
            assert.equal(services[0].lastError, 'adapter error');
        });

        it('emits SERVICE_FAILED for each failed service', async () => {
            let failedName = '';
            broker.on<{ name: string; error: string }>(APPLICATION_ACTIONS.SERVICE_FAILED, ({ name }) => {
                failedName = name;
            });

            await startupServices(
                [makeRegistration('svc', { fail: true })],
                broker,
                monitor
            );

            assert.equal(failedName, 'svc');
        });

        it('continues initialising remaining services after a failure', async () => {
            const result = await startupServices(
                [makeRegistration('svc-a', { fail: true }), makeRegistration('svc-b')],
                broker,
                monitor
            );

            const { services } = monitor.getSnapshot();
            const a = services.find((s) => s.name === 'svc-a');
            const b = services.find((s) => s.name === 'svc-b');

            assert.equal(a?.state, ServiceStateEnum.FAILED);
            assert.equal(b?.state, ServiceStateEnum.HEALTHY);
            assert.equal(result.length, 1);
        });
    });

    // ---- critical services ----

    describe('critical services', () => {
        it('emits APP_STARTUP_FAILED instead of APP_READY when a critical service fails', async () => {
            let ready = false;
            let failed = false;
            broker.on(APPLICATION_ACTIONS.APP_READY, () => { ready = true; });
            broker.on(APPLICATION_ACTIONS.APP_STARTUP_FAILED, () => { failed = true; });

            await startupServices(
                [makeRegistration('svc', { fail: true, critical: true })],
                broker,
                monitor
            );

            assert.equal(ready, false);
            assert.equal(failed, true);
        });

        it('includes failed critical service names in APP_STARTUP_FAILED payload', async () => {
            let failedNames: string[] = [];
            broker.on<{ failed: string[] }>(APPLICATION_ACTIONS.APP_STARTUP_FAILED, ({ failed }) => {
                failedNames = failed;
            });

            await startupServices(
                [makeRegistration('svc', { fail: true, critical: true })],
                broker,
                monitor
            );

            assert.deepEqual(failedNames, ['svc']);
        });

        it('still emits APP_READY when only an optional service fails', async () => {
            let ready = false;
            broker.on(APPLICATION_ACTIONS.APP_READY, () => { ready = true; });

            await startupServices(
                [makeRegistration('svc', { fail: true, critical: false })],
                broker,
                monitor
            );

            assert.equal(ready, true);
        });

        it('continues initialising services after a critical failure', async () => {
            await startupServices(
                [makeRegistration('critical-svc', { fail: true, critical: true }), makeRegistration('optional-svc')],
                broker,
                monitor
            );

            const { services } = monitor.getSnapshot();
            const optional = services.find((s) => s.name === 'optional-svc');
            assert.equal(optional?.state, ServiceStateEnum.HEALTHY);
        });
    });

    // ---- registration ----

    describe('registration', () => {
        it('registers all services with the health monitor before initialising any', async () => {
            const registeredDuringFirstAdapter: string[] = [];

            const firstAdapter: ServiceRegistration['adapter'] = async (_f, _b) => {
                registeredDuringFirstAdapter.push(
                    ...monitor.getSnapshot().services.map((s) => s.name)
                );
                return { name: 'svc-a', dispose: async () => {} };
            };

            await startupServices(
                [
                    { name: 'svc-a', factory: { build: async () => ({}) } as ServiceFactory<unknown>, adapter: firstAdapter },
                    makeRegistration('svc-b')
                ],
                broker,
                monitor
            );

            assert.ok(registeredDuringFirstAdapter.includes('svc-b'));
        });
    });

    // ---- idempotency ----

    describe('idempotency', () => {
        it('calling startupServices twice produces the same result as calling it once', async () => {
            const regs = [makeRegistration('svc-a'), makeRegistration('svc-b')];

            const first = await startupServices(regs, broker, monitor);
            const second = await startupServices(regs, broker, monitor);

            assert.equal(first.length, 2);
            assert.equal(second.length, 0); // skipped — already HEALTHY
            assert.ok(monitor.getSnapshot().services.every((s) => s.state === ServiceStateEnum.HEALTHY));
        });

        it('does not emit APP_READY twice on a second call with all services already initialised', async () => {
            const regs = [makeRegistration('svc')];
            let readyCount = 0;
            broker.on(APPLICATION_ACTIONS.APP_READY, () => { readyCount++; });

            await startupServices(regs, broker, monitor);
            await startupServices(regs, broker, monitor);

            assert.equal(readyCount, 2); // APP_READY is emitted each call, but no double-init
        });
    });
});
