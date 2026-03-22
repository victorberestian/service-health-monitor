import type { Broker } from './broker';

/** Identifiers for the application's windows */
const WINDOW_ID = {
  MAIN: 'main',
  PREFERENCES: 'preferences',
  TRAY: 'tray'
} as const;

type WindowId = (typeof WINDOW_ID)[keyof typeof WINDOW_ID];

const WINDOW_ACTIONS = {
  SHOW_WINDOW: 'window:show',
  HIDE_WINDOW: 'window:hide',
  WINDOW_READY: 'window:ready',
  SEND_TO_WINDOW: 'window:send-message'
} as const;

interface ShowWindowRequest {
  readonly windowId: WindowId;
}

interface WindowMessage {
  readonly windowId: WindowId;
  readonly topic: string;
  readonly payload?: unknown;
}

/**
 * Manages creation and lifecycle of application windows.
 * In a real Electron app, each "window" is a BrowserWindow instance.
 * For this assignment, simulate windows as objects that can receive messages.
 */
export class WindowManager {
  private windows: Map<WindowId, { visible: boolean; messageLog: Array<{ topic: string; payload?: unknown }> }> = new Map();

  constructor(private readonly broker: Broker) {
    this.broker.on<ShowWindowRequest>(WINDOW_ACTIONS.SHOW_WINDOW, ({ windowId }) => {
      this.showWindow(windowId);
    });

    this.broker.on<WindowMessage>(WINDOW_ACTIONS.SEND_TO_WINDOW, ({ windowId, topic, payload }) => {
      this.sendToWindow(windowId, topic, payload);
    });
  }

  /**
   * Create and register a window.
   *
   * @param windowId - Unique window identifier
   */
  createWindow(windowId: WindowId): void {
    this.windows.set(windowId, { visible: false, messageLog: [] });
    this.broker.send(WINDOW_ACTIONS.WINDOW_READY, { windowId });
  }

  private showWindow(windowId: WindowId): void {
    const window = this.windows.get(windowId);
    if (window) {
      window.visible = true;
    }
  }

  private sendToWindow(windowId: WindowId, topic: string, payload?: unknown): void {
    const window = this.windows.get(windowId);
    if (window) {
      window.messageLog.push({ topic, payload });
    }
  }

  /** Get the current state of a window (for testing) */
  getWindowState(windowId: WindowId): { visible: boolean; messageLog: Array<{ topic: string; payload?: unknown }> } | undefined {
    return this.windows.get(windowId);
  }
}

export { WINDOW_ID, WINDOW_ACTIONS };
export type { WindowId, ShowWindowRequest, WindowMessage };