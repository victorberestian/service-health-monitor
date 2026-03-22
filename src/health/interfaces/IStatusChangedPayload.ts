import { ServiceStateEnum } from "./ServiceStateEnum";
import { IServiceHealth } from "./IServiceHealth";

export interface IStatusChangedPayload {
    readonly serviceName: string;
    readonly previousState: ServiceStateEnum;
    readonly currentState: ServiceStateEnum;
    readonly health: IServiceHealth;
}
