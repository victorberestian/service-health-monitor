export const HealthTopicsEnum = {
    HEARTBEAT: 'health:heartbeat',
    ERROR_REPORT: 'health:error-report',
    SNAPSHOT_REQUEST: 'health:snapshot-request',
    SNAPSHOT_REPLY: 'health:snapshot-reply',
    STATUS_CHANGED: 'health:status-changed',
    OPEN_DASHBOARD: 'health:open-dashboard'
} as const;

export type HealthTopic = (typeof HealthTopicsEnum)[keyof typeof HealthTopicsEnum];
