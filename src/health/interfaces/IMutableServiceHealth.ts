import { ServiceStateEnum } from "./ServiceStateEnum";

/** Internal mutable health record — not exposed outside the health module */
export interface IMutableServiceHealth {
    name: string;
    state: ServiceStateEnum;
    registeredAt: number;
    lastHeartbeat: number | null;
    lastError: string | null;
}
