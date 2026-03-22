import { Broker } from "../../broker";
import {
    IServiceHealth,
    IHealthSnapshot,
    IHeartbeatPayload,
    IErrorReportPayload,
    IMutableServiceHealth,
    IHealthMonitorOptions,
    IStatusChangedPayload,
    ServiceStateEnum,
    HealthTopicsEnum
} from "../interfaces";


const DEFAULT_OPTIONS: IHealthMonitorOptions = {
    heartbeatTimeoutMs: 30_000
};

/**
 * Monitors the health of registered services via broker heartbeats and error reports.
 *
 * Each service has a state machine (see {@link ServiceStateEnum}) and a watchdog timer
 * that fires when heartbeats stop arriving. State transitions emit STATUS_CHANGED on
 * the broker. The monitor also answers SNAPSHOT_REQUEST messages with a full snapshot.
 *
 * Does not import any service directly — all communication is through the broker.
 */
export class HealthMonitorService {
    private readonly broker: Broker;
    private readonly services: Map<string, IMutableServiceHealth> = new Map();
    private readonly heartbeatTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private readonly options: IHealthMonitorOptions;
    private readonly unsubscribeHeartbeat: () => void;
    private readonly unsubscribeErrorReport: () => void;
    private readonly unsubscribeSnapshotRequest: () => void;

    /**
     * @param broker - Application message broker
     * @param options - Optional configuration overrides
     */
    constructor(broker: Broker, options?: Partial<IHealthMonitorOptions>) {
        this.broker = broker;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.unsubscribeHeartbeat = broker.on<IHeartbeatPayload>(
            HealthTopicsEnum.HEARTBEAT,
            ({ serviceName }) => {
                this.handleHeartbeat(serviceName);
            }
        );

        this.unsubscribeErrorReport = broker.on<IErrorReportPayload>(
            HealthTopicsEnum.ERROR_REPORT,
            ({ serviceName, error }) => {
                this.handleErrorReport(serviceName, error);
            }
        );

        this.unsubscribeSnapshotRequest = broker.on(
            HealthTopicsEnum.SNAPSHOT_REQUEST,
            () => {
                broker.send<IHealthSnapshot>(HealthTopicsEnum.SNAPSHOT_REPLY, this.getSnapshot());
            }
        );
    }

    /**
     * Register a service for health monitoring.
     * No-op if the service is already registered (idempotent).
     *
     * @param name - Unique service name
     */
    register(name: string): void {
        if (this.services.has(name)) {
            return;
        }

        this.services.set(name, {
            name,
            state: ServiceStateEnum.REGISTERED,
            registeredAt: Date.now(),
            lastHeartbeat: null,
            lastError: null
        });
    }

    /**
     * Transition a service from REGISTERED to STARTING.
     * No-op if the service is not in REGISTERED state.
     *
     * @param name - Service name
     */
    markStarting(name: string): void {
        const service = this.services.get(name);
        if (!service) {
            return;
        }

        if (service.state !== ServiceStateEnum.REGISTERED) {
            return;
        }

        this.changeStatus(service, ServiceStateEnum.STARTING);
    }

    /**
     * Transition a service to HEALTHY and start the heartbeat watchdog timer.
     * Emits STATUS_CHANGED if the state changes.
     *
     * @param name - Service name
     */
    markHealthy(name: string): void {
        const service = this.services.get(name);
        if (!service) {
            return;
        }

        service.lastHeartbeat = Date.now();
        this.changeStatus(service, ServiceStateEnum.HEALTHY);
        this.resetHeartbeatTimer(name);
    }

    /**
     * Transition a service to FAILED and clear its watchdog timer.
     * Emits STATUS_CHANGED if the state changes.
     *
     * @param name - Service name
     * @param error - Optional error message that caused the failure
     */
    markFailed(name: string, error?: string): void {
        const service = this.services.get(name);
        if (!service) {
            return;
        }

        this.clearTimer(name);

        if (error !== undefined) {
            service.lastError = error;
        }

        this.changeStatus(service, ServiceStateEnum.FAILED);
    }

    /**
     * Returns a point-in-time snapshot of all registered service health states.
     *
     * @returns Immutable snapshot
     */
    getSnapshot(): IHealthSnapshot {
        const services: IServiceHealth[] = [...this.services.values()].map(
            (service: IMutableServiceHealth): IServiceHealth => ({
                name: service.name,
                state: service.state,
                lastHeartbeat: service.lastHeartbeat,
                lastError: service.lastError,
                registeredAt: service.registeredAt
            })
        );

        return { services, timestamp: Date.now() };
    }

    /**
     * Unsubscribe all broker listeners and clear all watchdog timers.
     * After destroy() the monitor is inert.
     */
    destroy(): void {
        this.unsubscribeHeartbeat();
        this.unsubscribeErrorReport();
        this.unsubscribeSnapshotRequest();

        for (const name of Array.from(this.heartbeatTimers.keys())) {
            this.clearTimer(name);
        }
    }

    /**
     * Handles heartbeat resets timers.
     *
     * @param serviceName
     * @private
     */
    private handleHeartbeat(serviceName: string): void {
        const service = this.services.get(serviceName);
        if (!service) {
            return;
        }

        const { state } = service;

        if (state === ServiceStateEnum.REGISTERED || state === ServiceStateEnum.FAILED) {
            return;
        }

        service.lastHeartbeat = Date.now();

        if (state === ServiceStateEnum.UNHEALTHY) {
            this.resetHeartbeatTimer(serviceName);
            return;
        }

        this.changeStatus(service, ServiceStateEnum.HEALTHY);
        this.resetHeartbeatTimer(serviceName);
    }

    /**
     * Receives error report, change status to unhealthy and writes error, resets heartbeat timer.
     *
     * @param serviceName - string
     * @param error - string
     * @private
     */
    private handleErrorReport(serviceName: string, error: string): void {
        const service = this.services.get(serviceName);
        if (!service) {
            return;
        }

        const { state } = service;

        if (state === ServiceStateEnum.REGISTERED || state === ServiceStateEnum.FAILED) {
            return;
        }

        service.lastError = error;
        this.changeStatus(service, ServiceStateEnum.UNHEALTHY);
        this.resetHeartbeatTimer(serviceName);
    }

    /**
     * Mutate state and emit STATUS_CHANGED only when the state actually changes
     *
     * @param service - IMutableServiceHealth
     * @param newState - ServiceStateEnum
     *
     * @private
     */
    private changeStatus(service: IMutableServiceHealth, newState: ServiceStateEnum): void {
        const prevState = service.state;

        if (prevState === newState) {
            return;
        }

        service.state = newState;

        const payload: IStatusChangedPayload = {
            serviceName: service.name,
            previousState: prevState,
            currentState: newState,
            health: {
                name: service.name,
                state: service.state,
                lastHeartbeat: service.lastHeartbeat,
                lastError: service.lastError,
                registeredAt: service.registeredAt
            }
        };

        this.broker.send<IStatusChangedPayload>(HealthTopicsEnum.STATUS_CHANGED, payload);
    }

    /**
     * Resets timer of heartbeat for service
     *
     * @param serviceName
     * @private
     */
    private resetHeartbeatTimer(serviceName: string): void {
        this.clearTimer(serviceName);

        const timer = setTimeout(() => {
            const service = this.services.get(serviceName);
            if (!service) {
                return;
            }

            const { state } = service;

            if (
                state === ServiceStateEnum.STARTING ||
                state === ServiceStateEnum.HEALTHY ||
                state === ServiceStateEnum.UNHEALTHY
            ) {
                this.changeStatus(service, ServiceStateEnum.UNRESPONSIVE);
            }
        }, this.options.heartbeatTimeoutMs);

        this.heartbeatTimers.set(serviceName, timer);
    }

    /**
     * Removes timer for map of timers by service name.
     *
     * @param serviceName
     * @private
     */
    private clearTimer(serviceName: string): void {
        const existing = this.heartbeatTimers.get(serviceName);
        if (existing === undefined) {
            return;
        }

        clearTimeout(existing);
        this.heartbeatTimers.delete(serviceName);
    }
}
