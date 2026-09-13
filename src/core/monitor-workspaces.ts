import type {MonitorIndex} from './monitor.js';

export class MonitorWorkspaces {
    readonly #offsets: number[] = [];
    #workspaceCount = 1;

    constructor(monitorCount: number, workspaceCount: number) {
        this.reset(monitorCount, workspaceCount);
    }

    reset(monitorCount: number, workspaceCount: number): void {
        this.#offsets.splice(0);
        this.resize(monitorCount, workspaceCount);
    }

    resize(monitorCount: number, workspaceCount: number): void {
        if (!Number.isInteger(monitorCount) || monitorCount < 1) {
            throw new RangeError(`Invalid monitor count: ${String(monitorCount)}`);
        }
        if (!Number.isInteger(workspaceCount) || workspaceCount < 1) {
            throw new RangeError(`Invalid workspace count: ${String(workspaceCount)}`);
        }

        this.#workspaceCount = workspaceCount;
        this.#offsets.splice(monitorCount);
        while (this.#offsets.length < monitorCount) {
            this.#offsets.push(0);
        }
        this.#offsets.forEach((offset, monitor) => {
            this.#offsets[monitor] = this.#wrap(offset);
        });
    }

    completeSwitch(
        targetMonitor: MonitorIndex,
        previousWorkspace: number,
        activeWorkspace: number
    ): void {
        const shift = activeWorkspace - previousWorkspace;

        this.#offsets.forEach((offset, monitor) => {
            if (monitor !== targetMonitor) {
                this.#offsets[monitor] = this.#wrap(offset + shift);
            }
        });
    }

    active(monitor: MonitorIndex, physicalWorkspace: number): number {
        return this.toLogical(monitor, physicalWorkspace);
    }

    toLogical(monitor: MonitorIndex, physicalWorkspace: number): number {
        return this.#wrap(physicalWorkspace - this.#offset(monitor));
    }

    toPhysical(monitor: MonitorIndex, logicalWorkspace: number): number {
        return this.#wrap(logicalWorkspace + this.#offset(monitor));
    }

    #offset(monitor: MonitorIndex): number {
        const offset = this.#offsets[monitor];

        if (offset === undefined) {
            throw new RangeError(`Unknown monitor: ${String(monitor)}`);
        }

        return offset;
    }

    #wrap(workspace: number): number {
        return ((workspace % this.#workspaceCount) + this.#workspaceCount) % this.#workspaceCount;
    }
}
