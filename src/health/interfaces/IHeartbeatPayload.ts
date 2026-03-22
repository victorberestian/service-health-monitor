/** Payload published on {@link HealthTopicsEnum.HEARTBEAT} */
export interface IHeartbeatPayload {
    readonly serviceName: string;
}
