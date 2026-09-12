import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class GiwsExtension extends Extension {
    override enable(): void {
        // Runtime behavior will be introduced behind tested modules.
    }

    override disable(): void {
        // Every future resource registered in enable() must be released here.
    }
}
