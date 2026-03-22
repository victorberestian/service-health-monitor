import { IServiceHealth } from "./IServiceHealth";

/** Point-in-time snapshot of all registered service health states */
export interface IHealthSnapshot {
    readonly services: ReadonlyArray<IServiceHealth>;
    /** Unix timestamp (ms) when this snapshot was taken */
    readonly timestamp: number;
}
