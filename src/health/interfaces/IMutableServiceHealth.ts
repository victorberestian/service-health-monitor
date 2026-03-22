import { ServiceStateEnum } from "./ServiceStateEnum";

export interface IMutableServiceHealth {
    name: string;
    state: ServiceStateEnum;
    registeredAt: number;
    lastHeartbeat: number | null;
    lastError: string | null;
}
