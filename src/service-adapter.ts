import type { Broker } from './broker';

/**
 * Configuration for building a services from an adapter factory.
 */
export interface ServiceFactory<TService> {
  build(): Promise<TService>;
}

/**
 * Represents the initialization result of a services adapter.
 * The adapter wires broker messages to services method calls.
 */
export interface ServiceAdapterResult {
  /** Human-readable name of the services */
  readonly name: string;
  /** Call to gracefully shut down the services */
  dispose(): Promise<void>;
}

// --- Example: A "Persistence" services and its adapter ---

/** Represents user preferences stored on disk */
export interface UserPreferences {
  readonly downloadPath: string;
  readonly autoStart: boolean;
  readonly theme: 'light' | 'dark' | 'system';
}

/** Actions (topics) for the persistence domain */
const PERSISTENCE_ACTIONS = {
  GET_PREFERENCES: 'persistence:get-preferences',
  GET_PREFERENCES_REPLY: 'persistence:get-preferences:reply',
  SET_PREFERENCES: 'persistence:set-preferences',
  PREFERENCES_CHANGED: 'persistence:preferences-changed'
} as const;

/**
 * Persistence services — reads/writes user preferences to disk.
 */
class PersistenceService {
  private preferences: UserPreferences = {
    downloadPath: '/tmp/downloads',
    autoStart: false,
    theme: 'system'
  };

  async getPreferences(): Promise<UserPreferences> {
    // In a real implementation: read from file/db
    return this.preferences;
  }

  async setPreferences(prefs: UserPreferences): Promise<void> {
    // In a real implementation: write to file/db
    this.preferences = prefs;
  }
}

/**
 * Wires the PersistenceService to the broker.
 * This is the "adapter" — it translates broker messages into services calls.
 *
 * @param serviceFactory - Factory that builds the PersistenceService
 * @param broker - Application message broker
 * @returns The adapter result with dispose capability
 */
export async function listenPersistence(
  serviceFactory: ServiceFactory<PersistenceService>,
  broker: Broker
): Promise<ServiceAdapterResult> {
  const service = await serviceFactory.build();

  const unsubscribeGet = broker.on(PERSISTENCE_ACTIONS.GET_PREFERENCES, async () => {
    const preferences = await service.getPreferences();
    broker.send(PERSISTENCE_ACTIONS.GET_PREFERENCES_REPLY, preferences);
  });

  const unsubscribeSet = broker.on<UserPreferences>(PERSISTENCE_ACTIONS.SET_PREFERENCES, async (preferences) => {
    await service.setPreferences(preferences);
    broker.send(PERSISTENCE_ACTIONS.PREFERENCES_CHANGED, preferences);
  });

  return {
    name: 'PersistenceService',
    dispose: async () => {
      unsubscribeGet();
      unsubscribeSet();
    }
  };
}