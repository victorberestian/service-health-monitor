import { ServiceStateEnum } from "./ServiceStateEnum";

/** Public read-only health record for a single monitored service */
export interface IServiceHealth {
    readonly name: string;
    readonly state: ServiceStateEnum;
    /** Unix timestamp (ms) of the last received heartbeat, or null if none yet */
    readonly lastHeartbeat: number | null;
    /** Most recent error message, or null if none reported */
    readonly lastError: string | null;
    /** Unix timestamp (ms) when the service was registered */
    readonly registeredAt: number;
}
