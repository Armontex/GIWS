// A stand-in window for the README recording. The demo needs windows that read
// as different applications at a glance; running the real ones would tie the
// recording to whatever happens to be installed, and the shapes below say
// "browser" or "editor" just as well. Nothing here is an application: these are
// coloured boxes with a title.
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import system from 'system';

const WINDOW_HEIGHT = 340;
const WINDOW_WIDTH = 660;

const STYLE = `
window { background: #1D1B22; }
headerbar { min-height: 46px; }
.app-title { color: #FFFFFF; font-size: 24px; font-weight: 800; }
.surface { background: #26242C; }
.pane { background: #1A181F; }
.bar { background: #34313C; border-radius: 6px; }
.accent { background: #3584E4; border-radius: 6px; }
.warm { background: #F4A261; border-radius: 6px; }
.soft { background: #4A4653; border-radius: 6px; }
.faint { background: #35323D; border-radius: 6px; }
.bubble-in { background: #34313C; border-radius: 12px; }
.bubble-out { background: #3584E4; border-radius: 12px; }
.terminal { background: #14131A; }
.green { background: #57E389; border-radius: 4px; }
.purple { background: #C061CB; border-radius: 4px; }
`;

function parseArguments(argv) {
    const parsed = {
        height: WINDOW_HEIGHT,
        kind: 'browser',
        title: 'Window',
        width: WINDOW_WIDTH,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index + 1];

        if (value === undefined) {
            continue;
        }
        if (argv[index] === '--kind') {
            parsed.kind = value;
        }
        if (argv[index] === '--title') {
            parsed.title = value;
        }
        if (argv[index] === '--width') {
            parsed.width = Number.parseInt(value, 10);
        }
        if (argv[index] === '--height') {
            parsed.height = Number.parseInt(value, 10);
        }
    }
    return parsed;
}

function block(cssClass, width, height, {hexpand = false} = {}) {
    return new Gtk.Box({
        cssClasses: [cssClass],
        heightRequest: height,
        hexpand,
        widthRequest: width,
    });
}

function row(spacing, children, {margin = 0, hexpand = false, vexpand = false} = {}) {
    const box = new Gtk.Box({
        hexpand,
        marginBottom: margin,
        marginEnd: margin,
        marginStart: margin,
        marginTop: margin,
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing,
        vexpand,
    });

    for (const child of children) {
        box.append(child);
    }
    return box;
}

function column(spacing, children, {margin = 0, hexpand = false, vexpand = false} = {}) {
    const box = new Gtk.Box({
        hexpand,
        marginBottom: margin,
        marginEnd: margin,
        marginStart: margin,
        marginTop: margin,
        orientation: Gtk.Orientation.VERTICAL,
        spacing,
        vexpand,
    });

    for (const child of children) {
        box.append(child);
    }
    return box;
}

function browserBody() {
    const tabs = row(8, [
        block('accent', 150, 26),
        block('faint', 130, 26),
        block('faint', 130, 26),
    ]);
    const address = block('bar', 0, 30, {hexpand: true});
    const article = column(
        12,
        [
            block('soft', 0, 96, {hexpand: true}),
            block('faint', 0, 14, {hexpand: true}),
            block('faint', 0, 14, {hexpand: true}),
            block('faint', 320, 14),
        ],
        {hexpand: true, vexpand: true}
    );
    const aside = column(
        12,
        [block('faint', 130, 74), block('faint', 130, 54), block('faint', 130, 54)],
        {}
    );
    const content = row(14, [article, aside], {hexpand: true, vexpand: true});

    return column(12, [tabs, address, content], {hexpand: true, margin: 16, vexpand: true});
}

function messengerBody() {
    const contacts = column(
        10,
        [
            block('accent', 150, 40),
            block('faint', 150, 40),
            block('faint', 150, 40),
            block('faint', 150, 40),
            block('faint', 150, 40),
        ],
        {}
    );
    const chat = column(
        12,
        [
            row(0, [block('bubble-in', 220, 38)]),
            row(0, [block('bubble-out', 260, 52)], {hexpand: true}),
            row(0, [block('bubble-in', 180, 38)]),
            row(0, [block('bubble-out', 210, 38)], {hexpand: true}),
        ],
        {hexpand: true, vexpand: true}
    );

    return row(16, [contacts, chat], {hexpand: true, margin: 16, vexpand: true});
}

function editorBody() {
    const activity = column(
        12,
        [block('accent', 26, 26), block('soft', 26, 26), block('soft', 26, 26)],
        {}
    );
    const tree = column(
        9,
        [
            block('faint', 140, 16),
            block('faint', 120, 16),
            block('faint', 130, 16),
            block('faint', 100, 16),
            block('faint', 125, 16),
        ],
        {}
    );
    const code = column(
        9,
        [
            row(8, [block('purple', 44, 14), block('soft', 150, 14)]),
            row(8, [block('faint', 28, 14), block('green', 190, 14)]),
            row(8, [block('faint', 28, 14), block('soft', 120, 14), block('purple', 60, 14)]),
            row(8, [block('faint', 56, 14), block('soft', 210, 14)]),
            row(8, [block('green', 90, 14), block('faint', 130, 14)]),
            row(8, [block('faint', 28, 14), block('soft', 170, 14)]),
        ],
        {hexpand: true, vexpand: true}
    );

    return row(16, [activity, tree, code], {hexpand: true, margin: 16, vexpand: true});
}

function terminalBody() {
    const lines = column(
        10,
        [
            row(8, [block('green', 18, 14), block('soft', 210, 14)]),
            row(8, [block('faint', 240, 14)]),
            row(8, [block('faint', 180, 14)]),
            row(8, [block('warm', 120, 14), block('faint', 140, 14)]),
            row(8, [block('faint', 260, 14)]),
            row(8, [block('green', 18, 14), block('accent', 90, 14)]),
        ],
        {hexpand: true, margin: 18, vexpand: true}
    );
    const surface = new Gtk.Box({
        cssClasses: ['terminal'],
        hexpand: true,
        orientation: Gtk.Orientation.VERTICAL,
        vexpand: true,
    });

    surface.append(lines);
    return column(0, [surface], {hexpand: true, margin: 16, vexpand: true});
}

function buildBody(kind) {
    if (kind === 'messenger') {
        return messengerBody();
    }
    if (kind === 'editor') {
        return editorBody();
    }
    if (kind === 'terminal') {
        return terminalBody();
    }
    return browserBody();
}

const {height, kind, title, width} = parseArguments(system.programArgs);

Gtk.init();

const provider = new Gtk.CssProvider();

provider.load_from_string(STYLE);
Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
);

const window = new Gtk.Window({
    defaultHeight: height,
    defaultWidth: width,
    title,
});
const header = new Gtk.HeaderBar({showTitleButtons: true});

// The recording is downscaled by half, and GNOME's own title text would be
// six pixels tall by then. The name is what tells the windows apart.
header.set_title_widget(new Gtk.Label({cssClasses: ['app-title'], label: title}));

window.set_titlebar(header);

const surface = new Gtk.Box({
    cssClasses: ['surface'],
    orientation: Gtk.Orientation.VERTICAL,
});

surface.append(buildBody(kind));
window.set_child(surface);

const loop = GLib.MainLoop.new(null, false);

window.connect('close-request', () => {
    loop.quit();
    return false;
});
window.present();
loop.run();
