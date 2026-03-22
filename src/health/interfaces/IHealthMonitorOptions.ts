/** Configuration options for {@link HealthMonitorService} */
export interface IHealthMonitorOptions {
    /** Milliseconds of silence before a service is marked UNRESPONSIVE. Default: 30000 */
    heartbeatTimeoutMs: number;
}
