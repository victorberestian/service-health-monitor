/**
 * Broker topic constants for the health monitoring domain.
 *
 * Note: broker.on() replaces the existing handler for a topic, so each topic
 * should have exactly one subscriber at runtime.
 */
export const HealthTopicsEnum = {
    /** Published by a service to signal it is still alive */
    HEARTBEAT: 'health:heartbeat',
    /** Published by a service to report a non-fatal error */
    ERROR_REPORT: 'health:error-report',
    /** Published to request a snapshot of all service health states */
    SNAPSHOT_REQUEST: 'health:snapshot-request',
    /** Published by the health monitor in reply to SNAPSHOT_REQUEST */
    SNAPSHOT_REPLY: 'health:snapshot-reply',
    /** Published whenever a service lifecycle state changes */
    STATUS_CHANGED: 'health:status-changed',
    /** Published to open the health dashboard window */
    OPEN_DASHBOARD: 'health:open-dashboard'
} as const;

/** Union of all health topic string values */
export type HealthTopic = (typeof HealthTopicsEnum)[keyof typeof HealthTopicsEnum];
