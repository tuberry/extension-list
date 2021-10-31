// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject, Meta, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtDownloader = imports.ui.extensionDownloader;
const ExtManager = Main.extensionManager;
const ExtState = ExtensionUtils.ExtensionState;
const ExtType = ExtensionUtils.ExtensionType;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext || imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const Fields = {
    LITE:     'lite-mode',
    SWITCH:   'use-switch',
    UPLIST:   'unpin-list',
    URL:      'url-button',
    DEBUG:    'debug-button',
    UNPIN:    'unpin-button',
    VERBOSE:  'verbose-menu',
    DELETE:   'delete-button',
    DISABLED: 'hide-disabled',
};

const PopupScrollMenu = class extends PopupMenu.PopupMenuSection {
    constructor() {
        super();
        this.actor = new St.ScrollView({
            style: 'max-height: %dpx'.format(global.display.get_size()[1] - 100),
            style_class: 'extension-list-scroll-menu',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
            clip_to_allocation: true,
        });

        this.actor.add_actor(this.box);
        this.actor._delegate = this;
    }

    _needsScrollbar() {
        let [, topNaturalHeight] = this._getTopMenu().actor.get_preferred_height(-1);
        let topMaxHeight = this.actor.get_theme_node().get_max_height();

        return topMaxHeight >= 0 && topNaturalHeight >= topMaxHeight;
    }

    open() {
        let needsScrollbar = this._needsScrollbar();
        this.actor.vscrollbar_policy = needsScrollbar ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
        needsScrollbar ? this.actor.add_style_pseudo_class('scrolled') : this.actor.remove_style_pseudo_class('scrolled');

        super.open();
    }
};

const ExtensionList = GObject.registerClass({
    Properties: {
        'url':      GObject.ParamSpec.boolean('url', 'url', 'url', GObject.ParamFlags.READWRITE, false),
        'lite':     GObject.ParamSpec.boolean('lite', 'lite', 'lite', GObject.ParamFlags.READWRITE, false),
        'unpin':    GObject.ParamSpec.boolean('unpin', 'unpin', 'unpin', GObject.ParamFlags.READWRITE, false),
        'delete':   GObject.ParamSpec.boolean('delete', 'delete', 'delete', GObject.ParamFlags.READWRITE, false),
        'switch':   GObject.ParamSpec.boolean('switch', 'switch', 'switch', GObject.ParamFlags.READWRITE, false),
        'verbose':  GObject.ParamSpec.boolean('verbose', 'verbose', 'verbose', GObject.ParamFlags.READWRITE, false),
        'disabled': GObject.ParamSpec.boolean('disabled', 'disabled', 'disabled', GObject.ParamFlags.READWRITE, false),
    },
}, class ExtensionList extends GObject.Object {
    _init() {
        super._init();
        this._bindSettings();
        this._addIndicator();
        this._stateId = ExtManager.connect('extension-state-changed', this._updateMenu.bind(this));
    }

    _bindSettings() {
        gsettings.bind(Fields.DELETE,   this, 'delete',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SWITCH,   this, 'switch',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.VERBOSE,  this, 'verbose',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.DISABLED, this, 'disabled', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LITE,     this, 'lite',     Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.UNPIN,    this, 'unpin',    Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.URL,      this, 'url',      Gio.SettingsBindFlags.DEFAULT);
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(null, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button, 0, 'right');
    }

    get unpin_list() {
        return new Set(gsettings.get_strv(Fields.UPLIST));
    }

    set unpin_list(list) {
        gsettings.set_strv(Fields.UPLIST, list);
    }

    _extItemMaker(ext) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item' });
        let toggle = () => {
            this._button.menu.close();
            ExtManager.lookup(ext.uuid).state === ExtState.ENABLED
                ? ExtManager.disableExtension(ext.uuid)
                : ExtManager.enableExtension(ext.uuid);
        };
        item.connect('activate', toggle.bind(this));
        item.add_child(new St.Label({
            x_expand: true,
            text: ext.metadata.name + (ext.type === ExtType.SYSTEM ? ' *' : ''),
            style_class: 'extension-list-label%s'.format(ext.state === ExtState.ERROR ? '-error' : ''),
        }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        if(!this.disabled) {
            if(this.switch) hbox.add_child(new PopupMenu.Switch(ext.state === ExtState.ENABLED));
            else item.setOrnament(ext.state === ExtState.ENABLED ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
        let addButton = (flag, icon, func) => {
            let btn = new St.Button({ label: '    ', style_class: 'extension-list-prefs-button extension-list-button' });
            if(flag) btn.set_child(new St.Icon({ icon_name: '%s-symbolic'.format(icon), style_class: 'popup-menu-icon' }));
            btn.connect('clicked', flag ? () => { this._button.menu.close(); func(); } : toggle.bind(this));
            hbox.add_child(btn);
        };
        let btns = [[true, ext.hasPrefs, 'emblem-system', () => { ExtManager.openExtensionPrefs(ext.uuid, '', {}); }],
            [this.delete, ext.type !== ExtType.SYSTEM, 'edit-delete', () => { ExtDownloader.uninstallExtension(ext.uuid); this._updateMenu(); }],
            [this.url, ext.metadata.url, 'mail-forward', () => { Util.spawn(['gio', 'open', ext.metadata.url]); }]];
        if(this.lite) (btn => btn.shift() && addButton(...btn))(btns[(this.url << 1) + this.delete] || btns[0]);
        else btns.map(btn => btn.shift() && addButton(...btn));

        item.add_child(hbox);

        return item;
    }

    _pinItemMaker(ext, unpin) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item' });
        item.add_child(new St.Label({
            x_expand: true,
            text: ext.metadata.name + (ext.type === ExtType.SYSTEM ? ' *' : ''),
            style_class: 'extension-list-label%s'.format(ext.state === ExtState.ERROR ? '-error' : ''),
        }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        let btn = new St.Button({
            style_class: 'extension-list-prefs-button extension-list-button',
            child: new St.Icon({
                icon_name: unpin ? 'eye-not-looking-symbolic' : 'eye-open-negative-filled-symbolic',
                style_class: 'popup-menu-icon',
            }),
        });
        hbox.add_child(btn);
        item.add_child(hbox);
        let toggle = () => {
            let list = this.unpin_list;
            if(list.has(ext.uuid)) {
                let ok = list.delete(ext.uuid);
                if(ok) this.unpin_list = [...list];
                btn.child.icon_name = 'eye-open-negative-filled-symbolic';
            } else {
                this.unpin_list = [...list.add(ext.uuid)].filter(x => ExtManager.lookup(x));
                btn.child.icon_name = 'eye-not-looking-symbolic';
            }
        };
        btn.connect('clicked', toggle.bind(this));
        item.connect('activate', () => { toggle(); this.unpin = false; this._updateMenu(); });

        return item;
    }

    _settingsItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButton = (text, icon, callback, unpin) => {
            let btn = new St.Button({
                x_expand: true,
                style_class: 'extension-list-setting-button extension-list-button',
                child: new St.Icon({ icon_name: '%s-symbolic'.format(icon), style_class: 'popup-menu-icon' }),
            });
            btn.connect('clicked', () => { this._toggleUnpin(unpin); callback(); this._updateMenu(); });
            hbox.add_child(btn);
        };
        // item.connect('activate', () => { this._toggleUnpin(); this.verbose = true; this._updateMenu(); })
        this._settings.map(st => addButton(...st));
        item.add_child(hbox);

        return item;
    }

    _veboseItems() {
        let makeItem = (text, icon, callback, unpin) => {
            let item = new PopupMenu.PopupImageMenuItem(text, '%s-symbolic'.format(icon), { style_class: 'extension-list-item popup-menu-item' });
            item.connect('activate', () => { this._toggleUnpin(unpin); callback(); this._updateMenu(); });
            return item;
        };

        return this._settings.map(s => makeItem(...s));
    }

    get _settings() {
        let settings =  [
            [_('Open Extensions App'), 'application-x-addon', this._openExtensions.bind(this)],
            [_('Toggle enabled extensions'), 'face-cool', () => { this.disabled = !this.disabled; }],
            [_('Toggle delete buttons'), 'edit-delete', () => { this._toggleButton({ delete: !this.delete }); }],
            [_('Toggle homepage buttons'), 'mail-forward', () => { this._toggleButton({ url: !this.url }); }],
            [_('Hide/Unhide extensions'), 'eye-open-negative-filled', () => {}, true],
            // [this.lite ? _('Show more buttons') : _('Show less buttons'), this.lite ?  'list-add' : 'list-remove', () => { this.lite = !this.lite; }],
            // [_('Fold verbose menu'), this.verbose ?  'go-up' : 'go-down', () => { this.verbose = !this.verbose; }],
        ];
        if(gsettings.get_boolean(Fields.DEBUG)) settings.splice(1, 0, [_('Restart GNOME Shell'), 'applications-engineering', () => { this._button.menu.close(); this._reloadShell(); }]);

        return this.verbose ? settings.splice(-1).concat(settings) : settings;
    }

    _toggleButton(btn) {
        Object.assign(this, this.lite ? Object.assign({ url: false, delete: false }, btn) : btn);
    }

    _toggleUnpin(unpin) {
        if(unpin) this.unpin = !this.unpin;
        else
        if(this.unpin) this.unpin = false;
    }

    _reloadShell() {
        if(Meta.is_wayland_compositor()) Util.spawn(['dbus-run-session', '--', 'gnome-shell', '--nested', '--wayland']);
        else Meta.restart(_('Restarting…'));
    }

    _openExtensions() {
        this._button.menu.close();
        Util.spawn(['gapplication', 'launch', 'org.gnome.Extensions']);
    }

    _updateMenu() {
        if(!this._button) return;
        this._button.menu.removeAll();
        let scroll = new PopupScrollMenu();
        let unpin_list = this.unpin_list;
        if(this.unpin) {
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .map(x => ExtManager.lookup(x))
                .forEach(x => { scroll.addMenuItem(this._pinItemMaker(x, unpin_list.has(x.uuid))); });
        } else {
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .filter(x => !unpin_list.has(x))
                .map(x => ExtManager.lookup(x))
                .filter(x => !this.disabled || x.state === ExtState.ENABLED)
                .forEach(x => { scroll.addMenuItem(this._extItemMaker(x)); });
        }
        this._button.menu.addMenuItem(scroll);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        if(this.verbose) this._veboseItems().map(x => this._button.menu.addMenuItem(x));
        else this._button.menu.addMenuItem(this._settingsItem());
    }

    destroy() {
        if(this._stateId) ExtManager.disconnect(this._stateId), delete this._stateId;
        this._button.destroy();
        delete this._button;
    }
});

const Extension = class Extension {
    constructor() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        this._ext = new ExtensionList();
    }

    disable() {
        this._ext.destroy();
        delete this._ext;
    }
};

function init() {
    return new Extension();
}

