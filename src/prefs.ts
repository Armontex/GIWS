import type Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createPreferencesPage} from './preferences/preferences.js';

export default class GiwsPreferences extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        window.add(createPreferencesPage(this.getSettings()));
    }
}
