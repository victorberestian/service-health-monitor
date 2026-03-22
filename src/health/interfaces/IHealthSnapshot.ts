import { IServiceHealth } from "./IServiceHealth";

export interface IHealthSnapshot {
    readonly services: ReadonlyArray<IServiceHealth>;
    readonly timestamp: number;
}
