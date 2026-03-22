export const ServiceStateEnum = {
    REGISTERED: "REGISTERED",
    STARTING: "STARTING",
    HEALTHY: "HEALTHY",
    UNHEALTHY: "UNHEALTHY",
    UNRESPONSIVE: "UNRESPONSIVE",
    FAILED: "FAILED"
} as const;

export type ServiceStateEnum = (typeof ServiceStateEnum)[keyof typeof ServiceStateEnum];
