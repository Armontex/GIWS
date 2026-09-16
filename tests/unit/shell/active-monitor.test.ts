import {describe, expect, test} from 'vitest';

import {getActiveMonitor} from '../../../src/shell/active-monitor.js';

describe('getActiveMonitor', () => {
    test('returns a validated monitor index reported by GNOME Shell', () => {
        expect(getActiveMonitor({get_current_monitor: () => 2})).toBe(2);
    });

    test('rejects an invalid monitor index', () => {
        expect(() => getActiveMonitor({get_current_monitor: () => -1})).toThrow(
            'Invalid monitor index: -1'
        );
    });
});
