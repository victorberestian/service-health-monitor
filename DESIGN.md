# Design Document

## Uncertainties, trade-offs, and production revisits

The main uncertainty was around the `UNHEALTHY` state: when a service sends heartbeats again after reporting an error, should it automatically recover to `HEALTHY`? I chose to keep it `UNHEALTHY` until the watchdog fires (`UNRESPONSIVE`) and a subsequent heartbeat recovers it. This is conservative — an error is not cleared just because the service is still alive. In production I would revisit this: a service that self-reports errors but keeps heartbeating is arguably more trustworthy than one that goes silent, and a direct `UNHEALTHY → HEALTHY` transition on heartbeat might make more sense.

The 30-second heartbeat timeout is a single global value. In production each service would need its own threshold — a fast cache service and a slow database migration service cannot share the same timeout.

I would also replace `console.log` in `startup.ts` with a structured logger and add a proper shutdown sequence that calls `dispose()` on each `ServiceAdapterResult`.

## Assumptions the starter code does not guarantee

**`broker.on()` replaces, not appends.** The method signature implies multiple subscribers are supported, but the implementation does `set` instead of `push` — every new subscriber silently evicts the previous one. The entire design relies on this single-subscriber-per-topic constraint. If it were fixed to append handlers, `listenHealthDashboard` subscribing to `STATUS_CHANGED` would no longer replace any existing handler, which would actually be safer — but the current unsubscribe logic (filter by reference) would still work correctly.

**`WindowManager` owns `SHOW_WINDOW` and `SEND_TO_WINDOW` for the lifetime of the app.** If any other code called `broker.on(WINDOW_ACTIONS.SHOW_WINDOW, ...)` after `WindowManager` was constructed, it would silently break window visibility. There is no enforcement of topic ownership.

## Getting health data to the renderer process securely

In a real Electron app the health window renderer must not receive data directly from the broker. The correct approach:

1. In the **preload script**, expose a narrow API via `contextBridge` — e.g. `window.healthAPI.onStatusChanged(cb)` and `window.healthAPI.requestSnapshot()`.
2. In the **main process**, the existing `listenHealthDashboard` subscriber forwards `STATUS_CHANGED` and snapshot data via `ipcMain` / `webContents.send` to the specific `BrowserWindow`, not broadcast to all windows.
3. The renderer calls `ipcRenderer.invoke` for the snapshot and listens with `ipcRenderer.on` for live updates.

This keeps `nodeIntegration` disabled, never exposes the broker to the renderer, and limits the IPC surface to exactly what the health window needs.

## Hardest failure mode to test

The watchdog timer reset. The bug it guards against is subtle: if `clearTimeout` is not called before `setTimeout` in `resetHeartbeatTimer`, two timers run concurrently and the service goes `UNRESPONSIVE` even though heartbeats are arriving. The state assertion alone (`HEALTHY`) does not catch this — the second timer would fire later and still corrupt the state.

The approach: use `sinon.useFakeTimers()` to control time precisely, then advance to just before the timeout, send a heartbeat, advance again by the same amount, and assert the service is still `HEALTHY`. If the old timer was not cleared, the second tick would push the total elapsed time past the original deadline and the service would go `UNRESPONSIVE`. This test (`heartbeat before timeout resets the watchdog`) is the one I trust most.
