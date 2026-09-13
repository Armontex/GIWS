export interface ActivatableWindow {
    get_monitor(): number;
}

export interface ActivatableApp<Window extends ActivatableWindow> {
    get_windows(): Window[];
}

type RunOnMonitor = (monitor: number, activate: () => void) => void;

export class WorkspaceActivationRouter {
    readonly #runOnMonitor: RunOnMonitor;

    constructor(runOnMonitor: RunOnMonitor) {
        this.#runOnMonitor = runOnMonitor;
    }

    activateApp<Window extends ActivatableWindow>(
        app: ActivatableApp<Window>,
        activate: () => void
    ): void {
        this.activateWindow(app.get_windows()[0] ?? null, activate);
    }

    activateWindow(window: ActivatableWindow | null, activate: () => void): void {
        if (window === null) {
            activate();
            return;
        }

        this.#runOnMonitor(window.get_monitor(), activate);
    }
}
