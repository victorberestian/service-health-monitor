import { Broker } from '../../broker';
import { WindowManager, WINDOW_ACTIONS, WindowId } from '../../window-manager';
import { HealthMonitorService } from '../services';
import { HealthTopicsEnum, IStatusChangedPayload, IHealthSnapshot } from '../interfaces';

/**
 * The health window identifier.
 *
 * Cast to WindowId because the starter's WindowId union is closed — it only
 * contains the three windows defined in WINDOW_ID. Adding 'health' there would
 * require modifying the starter file, which is not allowed. The cast is safe:
 * WindowManager uses WindowId only as a Map key, so any unique string works at runtime.
 */
const HEALTH_WINDOW_ID = 'health' as WindowId;

/**
 * Wires the health dashboard window to the broker.
 *
 * - Listens for OPEN_DASHBOARD: creates the window (idempotent), shows it,
 *   and sends the current health snapshot to it.
 * - Listens for STATUS_CHANGED: forwards state-change payloads to the window
 *   so it stays up to date in real time. Only forwards if the window is open.
 *
 * @param broker - Application message broker
 * @param windowManager - Manages window creation and message delivery
 * @param healthMonitor - Source of health state and snapshots
 * @returns Dispose function that removes both broker subscriptions
 */
export function listenHealthDashboard(
    broker: Broker,
    windowManager: WindowManager,
    healthMonitor: HealthMonitorService
): () => void {
    let windowCreated = false;

    const unsubscribeOpen = broker.on(HealthTopicsEnum.OPEN_DASHBOARD, () => {
        if (!windowCreated) {
            windowManager.createWindow(HEALTH_WINDOW_ID);
            windowCreated = true;
        }

        broker.send(WINDOW_ACTIONS.SHOW_WINDOW, { windowId: HEALTH_WINDOW_ID });

        const snapshot = healthMonitor.getSnapshot();
        broker.send(WINDOW_ACTIONS.SEND_TO_WINDOW, {
            windowId: HEALTH_WINDOW_ID,
            topic: HealthTopicsEnum.SNAPSHOT_REPLY,
            payload: snapshot
        });
    });

    const unsubscribeStatus = broker.on<IStatusChangedPayload>(
        HealthTopicsEnum.STATUS_CHANGED,
        (payload) => {
            if (!windowCreated) {
                return;
            }

            broker.send(WINDOW_ACTIONS.SEND_TO_WINDOW, {
                windowId: HEALTH_WINDOW_ID,
                topic: HealthTopicsEnum.STATUS_CHANGED,
                payload
            });
        }
    );

    return () => {
        unsubscribeOpen();
        unsubscribeStatus();
    };
}

export { HEALTH_WINDOW_ID };
