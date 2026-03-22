import { ServiceStateEnum } from "./ServiceStateEnum";

export interface IServiceHealth {
    readonly name: string;
    readonly state: ServiceStateEnum;
    readonly lastHeartbeat: number | null;
    readonly lastError: string | null;
    readonly registeredAt: number;
}
