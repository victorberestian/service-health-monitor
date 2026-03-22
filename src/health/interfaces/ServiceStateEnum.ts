/**
 * All possible lifecycle states for a monitored service.
 *
 * Transitions:
 * - register()         → REGISTERED
 * - markStarting()     REGISTERED → STARTING
 * - markHealthy()      * → HEALTHY (starts watchdog timer)
 * - markFailed()       * → FAILED  (clears watchdog timer)
 * - heartbeat received STARTING | HEALTHY | UNRESPONSIVE → HEALTHY; UNHEALTHY stays UNHEALTHY
 * - error report       STARTING | HEALTHY | UNHEALTHY | UNRESPONSIVE → UNHEALTHY
 * - watchdog expires   STARTING | HEALTHY | UNHEALTHY → UNRESPONSIVE
 */
export const ServiceStateEnum = {
    /** Registered with the health monitor but not yet initialising */
    REGISTERED: "REGISTERED",
    /** Adapter is being built and wired */
    STARTING: "STARTING",
    /** Running and sending heartbeats as expected */
    HEALTHY: "HEALTHY",
    /** Running but has reported a non-fatal error */
    UNHEALTHY: "UNHEALTHY",
    /** Heartbeat timeout elapsed — service may have crashed */
    UNRESPONSIVE: "UNRESPONSIVE",
    /** Adapter threw during initialisation */
    FAILED: "FAILED"
} as const;

/** Union of all possible service state values */
export type ServiceStateEnum = (typeof ServiceStateEnum)[keyof typeof ServiceStateEnum];
