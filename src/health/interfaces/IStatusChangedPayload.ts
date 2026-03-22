import { ServiceStateEnum } from "./ServiceStateEnum";
import { IServiceHealth } from "./IServiceHealth";

/** Payload published on {@link HealthTopicsEnum.STATUS_CHANGED} */
export interface IStatusChangedPayload {
    readonly serviceName: string;
    readonly previousState: ServiceStateEnum;
    readonly currentState: ServiceStateEnum;
    /** Full health record after the transition */
    readonly health: IServiceHealth;
}
