import type { Broker } from './broker';
import type { ServiceAdapterResult, ServiceFactory } from './service-adapter';
import { HealthMonitorService } from "./health/services";
import { IServiceHealth, ServiceStateEnum } from "./health/interfaces";

const APPLICATION_ACTIONS = {
    APP_READY: 'app:ready',
    SERVICE_INITIALIZED: 'app:services-initialized',
    SERVICE_FAILED: 'app:services-failed',
    APP_STARTUP_FAILED: 'app:startup-failed'
} as const;

interface ServiceRegistration {
    readonly name: string;
    readonly factory: ServiceFactory<unknown>;
    readonly adapter: (factory: ServiceFactory<unknown>, broker: Broker) => Promise<ServiceAdapterResult>;
    readonly critical?: boolean;
}

/**
 * Orchestrates the startup of all application services.
 * Currently initializes services sequentially with no health tracking.
 *
 * @param registrations - Ordered list of services to initialize
 * @param broker - Application message broker
 * @param healthMonitorService - health monitor to track service states
 */
export async function startupServices(
    registrations: ReadonlyArray<ServiceRegistration>,
    broker: Broker,
    healthMonitorService: HealthMonitorService
): Promise<ReadonlyArray<ServiceAdapterResult>> {
    const initStartupTime: number = Date.now();
    const results: ServiceAdapterResult[] = [];
    const failedCriticalServices: string[] = [];

    for (const service of registrations) {
        healthMonitorService.register(service.name);
    }

    for (const registration of registrations) {
        const existing: IServiceHealth | undefined = healthMonitorService.getSnapshot().services
            .find(service => service.name === registration.name);

        if (existing && existing.state !== ServiceStateEnum.REGISTERED) {
            continue;
        }

        healthMonitorService.markStarting(registration.name);
        const serviceStartTime: number = Date.now();
        try {
            const result = await registration.adapter(registration.factory, broker);
            const serviceStartedTime = Date.now() - serviceStartTime;
            results.push(result);
            healthMonitorService.markHealthy(registration.name);
            broker.send(APPLICATION_ACTIONS.SERVICE_INITIALIZED, {name: registration.name});
            console.log(`[startup] ${registration.name} initialized in ${serviceStartedTime}ms`);
        } catch (error) {
            const serviceFailedTime = Date.now() - serviceStartTime;
            const message = error instanceof Error ? error.message : String(error);

            healthMonitorService.markFailed(registration.name, message);

            broker.send(APPLICATION_ACTIONS.SERVICE_FAILED, {
                name: registration.name,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            console.warn(`[startup] ${registration.name} failed after ${serviceFailedTime}ms`);

            if (registration.critical) {
                failedCriticalServices.push(registration.name);
            }
        }
    }

    const totalStartupTime = Date.now() - initStartupTime;
    console.log(`Startup total: ${totalStartupTime}ms`);

    if (failedCriticalServices.length > 0) {
        broker.send(APPLICATION_ACTIONS.APP_STARTUP_FAILED, { failed: failedCriticalServices });

        return results;
    }

    broker.send(APPLICATION_ACTIONS.APP_READY);
    return results;
}

export { APPLICATION_ACTIONS };
export type { ServiceRegistration };