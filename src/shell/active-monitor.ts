import {asMonitorIndex, type MonitorIndex} from '../core/monitor.js';

export interface MonitorProvider {
    get_current_monitor(): number;
}

export function getActiveMonitor(provider: MonitorProvider): MonitorIndex {
    return asMonitorIndex(provider.get_current_monitor());
}
