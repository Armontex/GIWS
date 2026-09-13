import {describe, expect, test} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {MonitorWorkspaces} from '../../../src/core/monitor-workspaces.js';

describe('MonitorWorkspaces', () => {
    test('keeps non-target logical workspaces stable after a global switch', () => {
        const workspaces = new MonitorWorkspaces(2, 4);

        workspaces.completeSwitch(asMonitorIndex(0), 0, 1);

        expect(workspaces.active(asMonitorIndex(0), 1)).toBe(1);
        expect(workspaces.active(asMonitorIndex(1), 1)).toBe(0);
        expect(workspaces.toLogical(asMonitorIndex(1), 1)).toBe(0);
        expect(workspaces.toPhysical(asMonitorIndex(1), 0)).toBe(1);
    });

    test('preserves every monitor except the target across consecutive switches', () => {
        const workspaces = new MonitorWorkspaces(3, 4);

        workspaces.completeSwitch(asMonitorIndex(0), 0, 1);
        workspaces.completeSwitch(asMonitorIndex(1), 1, 2);

        expect([
            workspaces.active(asMonitorIndex(0), 2),
            workspaces.active(asMonitorIndex(1), 2),
            workspaces.active(asMonitorIndex(2), 2),
        ]).toEqual([1, 1, 0]);
    });

    test('wraps logical workspace mappings in both directions', () => {
        const workspaces = new MonitorWorkspaces(2, 4);

        workspaces.completeSwitch(asMonitorIndex(0), 0, 3);

        expect(workspaces.active(asMonitorIndex(0), 3)).toBe(3);
        expect(workspaces.active(asMonitorIndex(1), 3)).toBe(0);
        expect(workspaces.toLogical(asMonitorIndex(1), 0)).toBe(1);
        expect(workspaces.toPhysical(asMonitorIndex(1), 0)).toBe(3);
    });

    test('resizes safely when monitors or static workspaces change at runtime', () => {
        const workspaces = new MonitorWorkspaces(2, 4);
        workspaces.completeSwitch(asMonitorIndex(0), 0, 3);

        workspaces.resize(3, 2);

        expect(workspaces.active(asMonitorIndex(1), 0)).toBe(1);
        expect(workspaces.active(asMonitorIndex(2), 0)).toBe(0);
    });

    test('resets logical offsets when monitor topology changes', () => {
        const workspaces = new MonitorWorkspaces(2, 4);
        workspaces.completeSwitch(asMonitorIndex(0), 0, 1);

        workspaces.reset(2, 4);

        expect(workspaces.active(asMonitorIndex(1), 1)).toBe(1);
    });
});
