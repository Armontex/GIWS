import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DisposableStack} from './lifecycle/disposables.js';
import {Logger} from './logging/logger.js';
import {SETTINGS_SCHEMA} from './settings/keys.js';
import {GiwsSettings} from './settings/settings.js';

export default class GiwsExtension extends Extension {
    #resources: DisposableStack | null = null;
    #logger: Logger | null = null;

    override enable(): void {
        const resources = new DisposableStack();
        const settings = new GiwsSettings(this.getSettings(SETTINGS_SCHEMA));
        const logger = new Logger('extension', console, () => settings.debugLogging);

        this.#resources = resources;
        this.#logger = logger;
        logger.debug('enabled');
    }

    override disable(): void {
        try {
            this.#resources?.dispose();
            this.#logger?.debug('disabled');
        } catch (error) {
            this.#logger?.error('disable failed', error);
        } finally {
            this.#resources = null;
            this.#logger = null;
        }
    }
}
