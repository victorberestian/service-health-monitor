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

export class HealthMonitorService {
    private readonly broker: Broker;
    private readonly services: Map<string, IMutableServiceHealth> = new Map();
    private readonly heartbeatTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private readonly options: IHealthMonitorOptions;
    private readonly unsubscribeHeartbeat: () => void;
    private readonly unsubscribeErrorReport: () => void;
    private readonly unsubscribeSnapshotRequest: () => void;

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

    markHealthy(name: string): void {
        const service = this.services.get(name);
        if (!service) {
            return;
        }

        service.lastHeartbeat = Date.now();
        this.changeStatus(service, ServiceStateEnum.HEALTHY);
        this.resetHeartbeatTimer(name);
    }

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

    destroy(): void {
        this.unsubscribeHeartbeat();
        this.unsubscribeErrorReport();
        this.unsubscribeSnapshotRequest();

        for (const name of Array.from(this.heartbeatTimers.keys())) {
            this.clearTimer(name);
        }
    }

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

    private clearTimer(serviceName: string): void {
        const existing = this.heartbeatTimers.get(serviceName);
        if (existing === undefined) {
            return;
        }

        clearTimeout(existing);
        this.heartbeatTimers.delete(serviceName);
    }
}
