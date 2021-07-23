// vim:fdm=syntax
// by: tuberry@github
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { Shell, GLib, St, GObject, Meta, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtDownloader = imports.ui.extensionDownloader;
const ExtManager = Main.extensionManager;
const ExtState = ExtensionUtils.ExtensionState;
const ExtType = ExtensionUtils.ExtensionType;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();

const Fields = {
    UNPINLIST: 'unpin-list',
    URL:       'url-button',
    DEBUG:     'debug-button',
    UNPIN:     'unpin-button',
    DELETE:    'delete-button',
    DISABLED:  'hide-disabled',
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
        'unpin':    GObject.ParamSpec.boolean('unpin', 'unpin', 'unpin', GObject.ParamFlags.READWRITE, false),
        'delete':   GObject.ParamSpec.boolean('delete', 'delete', 'delete', GObject.ParamFlags.READWRITE, false),
        'disabled': GObject.ParamSpec.boolean('disabled', 'disabled', 'disabled', GObject.ParamFlags.READWRITE, false),
    },
}, class ExtensionList extends GObject.Object {
    _init() {
        super._init();
        this._bindSettings();
        this._addIndicator();
        this._stateChangeId = ExtManager.connect('extension-state-changed', this._updateMenu.bind(this));
    }

    get _unpinlist() {
        return new Set(gsettings.get_strv(Fields.UNPINLIST));
    }

    set _unpinlist(list) {
        gsettings.set_strv(Fields.UNPINLIST, list);
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(null, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button, 0, 'right');
    }

    _menuItemMaker(ext) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item' });
        item.setOrnament(ext.state == ExtState.ENABLED && !this.disabled ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        let toggle = () => { item._ornament == PopupMenu.Ornament.NONE && !this.disabled ? ExtManager.enableExtension(ext.uuid) : ExtManager.disableExtension(ext.uuid); };
        item.connect('activate', () => { item._getTopMenu().close(); toggle(); });
        item.add_child(new St.Label({
            x_expand: true,
            text: ext.metadata.name + (ext.type == ExtType.SYSTEM ? ' *' : ''),
            style_class: 'extension-list-label%s'.format(ext.state == ExtState.ERROR ? '-error' : ''),
        }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                style_class: 'extension-list-prefs-button extension-list-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            btn.connect('clicked', () => { item._getTopMenu().close(); func(); });
            hbox.add_child(btn);
        }
        if(this.url) {
            if(ext.metadata.url) addButtonItem('mail-forward-symbolic', () => { Util.spawn(["gio", "open", ext.metadata.url]); });
        } else if(this.delete) {
            if(ext.type != ExtType.SYSTEM) addButtonItem('edit-delete-symbolic', () => { ExtDownloader.uninstallExtension(ext.uuid); this._updateMenu(); });
        } else {
            if(ext.hasPrefs) addButtonItem('emblem-system-symbolic', () => { ExtManager.openExtensionPrefs(ext.uuid, '', {}); });
        }
        item.add_child(hbox);
        return item;
    }

    _pinItemMaker(ext, unpin) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item' });
        item.add_child(new St.Label({
            x_expand: true,
            text: ext.metadata.name + (ext.type == ExtType.SYSTEM ? ' *' : ''),
            style_class: 'extension-list-label%s'.format(ext.state == ExtState.ERROR ? '-error' : ''),
        }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        let icon = unpin ? 'eye-not-looking-symbolic' : 'eye-open-negative-filled-symbolic';
        let btn = new St.Button({
            style_class: 'extension-list-prefs-button extension-list-button',
            child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
        });
        hbox.add_child(btn);
        item.add_child(hbox);
        let toggle = () => {
            let list = this._unpinlist;
            if(list.has(ext.uuid)) {
                let ok = list.delete(ext.uuid);
                if(ok) this._unpinlist = [...list];
                btn.child.icon_name = 'eye-open-negative-filled-symbolic';
            } else {
                this._unpinlist = [...list.add(ext.uuid)];
                btn.child.icon_name = 'eye-not-looking-symbolic';
            }
            if(this.unpin) this.unpin = false;
        }
        btn.connect('clicked', toggle.bind(this));
        item.connect('activate', () => { toggle(); this._updateMenu(); });

        return item;
    }

    _settingsItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item popup-menu-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func, unpin) => {
            let btn = new St.Button({
                x_expand: true,
                style_class: 'extension-list-setting-button extension-list-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            btn.connect('clicked', () => {
                if(unpin) {
                    this.unpin = !this.unpin; func();
                } else {
                    if(this.unpin) this.unpin = false; func();
                }
            });
            hbox.add_child(btn);
        }
        addButtonItem('application-x-addon-symbolic', () => {
            item._getTopMenu().close();
            Shell.AppSystem.get_default().lookup_app('org.gnome.Extensions.desktop').activate();
            this._updateMenu();
        });
        if(gsettings.get_boolean(Fields.DEBUG))
            addButtonItem('applications-engineering-symbolic', () => { item._getTopMenu().close(); this._reloadShell(); });
        addButtonItem('face-cool-symbolic', () => { this.disabled = !this.disabled; this._updateMenu(); });
        addButtonItem('mail-forward-symbolic', () => { this._singleton(!this.url, false); });
        addButtonItem('edit-delete-symbolic', () => { this._singleton(false, !this.delete); });
        addButtonItem('eye-open-negative-filled-symbolic', this._updateMenu.bind(this), true);
        item.add_child(hbox);
        return item;
    }

    _reloadShell() {
        if(Meta.is_wayland_compositor()) {
            Util.spawn(['dbus-run-session', '--', 'gnome-shell', '--nested', '--wayland']);
        } else {
            Meta.restart(_("Restarting…"));
        }
    }

    _singleton(x, y) {
        if(this.url != x) this.url = x;
        if(this.delete != y) this.delete = y;
        this._updateMenu();
    }

    _updateMenu() {
        this._button.menu.removeAll();
        let scroll = new PopupScrollMenu();
        let unpinlist = this._unpinlist;
        if(this.unpin) {
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .map(x => ExtManager.lookup(x))
                .forEach(x => { scroll.addMenuItem(this._pinItemMaker(x, unpinlist.has(x.uuid))); });
        } else {
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .filter(x => !unpinlist.has(x))
                .map(x => ExtManager.lookup(x))
                .filter(x => !this.disabled || x.state === ExtState.ENABLED)
                .forEach(x => { scroll.addMenuItem(this._menuItemMaker(x)); });
        }
        this._button.menu.addMenuItem(scroll);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingsItem());
    }

    _bindSettings() {
        gsettings.bind(Fields.DELETE,   this, 'delete',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.DISABLED, this, 'disabled', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.UNPIN,    this, 'unpin',    Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.URL,      this, 'url',      Gio.SettingsBindFlags.DEFAULT);
    }

    destroy() {
        if(this._stateChangeId) ExtManager.disconnect(this._stateChangeId), this._stateChangeId = 0;
        this._button.destroy();
        delete this._button;
    }
});

const Extension = class Extension {
    constructor() {
    }

    enable() {
        this._ext = new ExtensionList();
    }

    disable() {
        this._ext.destroy();
        delete this._ext;
    }
}

function init() {
    return new Extension();
}

