import {SettingsKey} from './keys.js';

export interface SettingsBackend {
    get_boolean(key: string): boolean;
    set_boolean(key: string, value: boolean): boolean;
}

export class GiwsSettings {
    readonly #backend: SettingsBackend;

    constructor(backend: SettingsBackend) {
        this.#backend = backend;
    }

    get debugLogging(): boolean {
        return this.#backend.get_boolean(SettingsKey.DebugLogging);
    }

    set debugLogging(enabled: boolean) {
        this.#backend.set_boolean(SettingsKey.DebugLogging, enabled);
    }
}
