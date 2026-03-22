import type { Broker } from './broker';
import type { ServiceAdapterResult, ServiceFactory } from './service-adapter';

const APPLICATION_ACTIONS = {
  APP_READY: 'app:ready',
  SERVICE_INITIALIZED: 'app:services-initialized',
  SERVICE_FAILED: 'app:services-failed'
} as const;

interface ServiceRegistration {
  readonly name: string;
  readonly factory: ServiceFactory<unknown>;
  readonly adapter: (factory: ServiceFactory<unknown>, broker: Broker) => Promise<ServiceAdapterResult>;
}

/**
 * Orchestrates the startup of all application services.
 * Currently initializes services sequentially with no health tracking.
 *
 * @param registrations - Ordered list of services to initialize
 * @param broker - Application message broker
 */
export async function startupServices(
  registrations: ReadonlyArray<ServiceRegistration>,
  broker: Broker
): Promise<ReadonlyArray<ServiceAdapterResult>> {
  const results: ServiceAdapterResult[] = [];

  for (const registration of registrations) {
    try {
      const result = await registration.adapter(registration.factory, broker);
      results.push(result);
      broker.send(APPLICATION_ACTIONS.SERVICE_INITIALIZED, { name: registration.name });
    } catch (error) {
      broker.send(APPLICATION_ACTIONS.SERVICE_FAILED, {
        name: registration.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Currently: fail fast. Your implementation may change this behavior.
      throw error;
    }
  }

  broker.send(APPLICATION_ACTIONS.APP_READY);
  return results;
}

export { APPLICATION_ACTIONS };
export type { ServiceRegistration };