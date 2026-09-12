declare const monitorIndexBrand: unique symbol;

export type MonitorIndex = number & {[monitorIndexBrand]: true};

export function asMonitorIndex(value: number): MonitorIndex {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`Invalid monitor index: ${String(value)}`);
    }

    return value as MonitorIndex;
}
