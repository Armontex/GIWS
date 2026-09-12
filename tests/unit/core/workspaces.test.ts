import {describe, expect, test} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {
    SwitchDirection,
    planGlobalSwitchCompensation,
    planMonitorSwitch,
    type WindowPlacement,
} from '../../../src/core/workspaces.js';

const primary = asMonitorIndex(0);
const secondary = asMonitorIndex(1);

function window(id: string, monitor: number, workspace: number): WindowPlacement<string> {
    return {id, monitor: asMonitorIndex(monitor), workspace};
}

describe('planMonitorSwitch', () => {
    test('rotates only the selected monitor towards the next workspace', () => {
        const windows = [
            window('current', 1, 0),
            window('next', 1, 1),
            window('last', 1, 3),
            window('primary', 0, 0),
        ];

        expect(planMonitorSwitch(windows, secondary, 4, SwitchDirection.Next)).toEqual([
            {id: 'current', workspace: 3},
            {id: 'next', workspace: 0},
            {id: 'last', workspace: 2},
        ]);
    });

    test('rotates towards the previous workspace with wraparound', () => {
        const windows = [window('first', 1, 0), window('last', 1, 3)];

        expect(planMonitorSwitch(windows, secondary, 4, SwitchDirection.Previous)).toEqual([
            {id: 'first', workspace: 1},
            {id: 'last', workspace: 0},
        ]);
    });
});

describe('planGlobalSwitchCompensation', () => {
    test('keeps inactive monitors visible after a real global workspace switch', () => {
        const windows = [
            window('primary', 0, 0),
            window('secondary-current', 1, 0),
            window('secondary-last', 1, 3),
        ];

        expect(planGlobalSwitchCompensation(windows, primary, 4, 0, 1)).toEqual([
            {id: 'secondary-current', workspace: 1},
            {id: 'secondary-last', workspace: 0},
        ]);
    });
});
