import {describe, expect, test, vi} from 'vitest';

import {SettingsKey} from '../../../src/settings/keys.js';
import {GiwsSettings, type SettingsBackend} from '../../../src/settings/settings.js';

describe('GiwsSettings', () => {
    test('reads and writes debug logging through the declared schema key', () => {
        const getBoolean = vi.fn(() => true);
        const setBoolean = vi.fn(() => true);
        const backend: SettingsBackend = {
            get_boolean: getBoolean,
            set_boolean: setBoolean,
        };
        const settings = new GiwsSettings(backend);

        expect(settings.debugLogging).toBe(true);
        settings.debugLogging = false;

        expect(getBoolean.mock.calls).toEqual([[SettingsKey.DebugLogging]]);
        expect(setBoolean.mock.calls).toEqual([[SettingsKey.DebugLogging, false]]);
    });
});
