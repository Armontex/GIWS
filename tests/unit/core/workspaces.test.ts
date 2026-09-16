import {describe, expect, test} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {planGlobalSwitchCompensation, type WindowPlacement} from '../../../src/core/workspaces.js';

const primary = asMonitorIndex(0);
function window(id: string, monitor: number, workspace: number): WindowPlacement<string> {
    return {id, monitor: asMonitorIndex(monitor), workspace};
}

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
