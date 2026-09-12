import Adw from 'gi://Adw';

import {GiwsSettings, type SettingsBackend} from '../settings/settings.js';

export function createPreferencesPage(backend: SettingsBackend): Adw.PreferencesPage {
    const settings = new GiwsSettings(backend);
    const page = new Adw.PreferencesPage({
        icon_name: 'preferences-system-symbolic',
        title: 'General',
    });
    const group = new Adw.PreferencesGroup({title: 'Diagnostics'});
    const debugLogging = new Adw.SwitchRow({
        active: settings.debugLogging,
        subtitle: 'Write diagnostic messages to the GNOME Shell journal',
        title: 'Debug logging',
    });

    debugLogging.connect('notify::active', () => {
        settings.debugLogging = debugLogging.active;
    });

    group.add(debugLogging);
    page.add(group);

    return page;
}
