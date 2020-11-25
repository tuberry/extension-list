// vim:fdm=syntax
// by tuberry

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { Shell, GLib, St, GObject, Meta } = imports.gi;

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
    PREFS:     'prefs-button',
    UNPIN:     'unpin-button',
    DELETE:    'delete-button',
    DISABLED:  'hide-disabled',
};

var PopupScrollMenu = class extends PopupMenu.PopupMenuSection {
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

const ExtensionList = GObject.registerClass(
class ExtensionList extends GObject.Object {
    _init() {
        super._init();
    }

    get _url() {
        return gsettings.get_boolean(Fields.URL);
    }

    get _prefs() {
        return gsettings.get_boolean(Fields.PREFS);
    }

    get _delete() {
        return gsettings.get_boolean(Fields.DELETE);
    }

    get _disabled() {
        return gsettings.get_boolean(Fields.DISABLED);
    }

    get _unpin() {
        return gsettings.get_boolean(Fields.UNPIN);
    }

    get _unpinlist() {
        return new Set(gsettings.get_strv(Fields.UNPINLIST));
    }

    set _unpinlist(list) {
        gsettings.set_strv(Fields.UNPINLIST, list);
    }

    _addButton() {
        this._button = new PanelMenu.Button(0.0, null, false);
        this._button.add_child(new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button, 0, 'right');
    }

    _menuItemMaker(ext) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
        item.setOrnament(ext.state == ExtState.ENABLED && !this._disabled ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        let toggle = () => { item._ornament == PopupMenu.Ornament.NONE && !this._disabled ? ExtManager.enableExtension(ext.uuid) : ExtManager.disableExtension(ext.uuid); };
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
        if(this._prefs && ext.hasPrefs) addButtonItem('emblem-system-symbolic', () => { ExtManager.openExtensionPrefs(ext.uuid, '', {}); });
        if(this._url && ext.metadata.url) addButtonItem('mail-forward-symbolic', () => { Util.spawn(["gio", "open", ext.metadata.url]); });
        if(this._delete && ext.type != ExtType.SYSTEM) addButtonItem('edit-delete-symbolic', () => { ExtDownloader.uninstallExtension(ext.uuid); this._updateMenu(); });
        item.add_child(hbox);
        return item;
    }

    _pinItemMaker(ext, unpin) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
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
            if(this._unpin) gsettings.set_boolean(Fields.UNPIN, false);
        }
        btn.connect('clicked', toggle);
        item.connect('activate', () => { toggle(); this._updateMenu(); });

        return item;
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func, unpin) => {
            let btn = new St.Button({
                hover: true,
                x_expand: true,
                style_class: 'extension-list-setting-button extension-list-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            btn.connect('clicked', () => {
                if(unpin) {
                    gsettings.set_boolean(Fields.UNPIN, !this._unpin); func();
                } else {
                    if(this._unpin) gsettings.set_boolean(Fields.UNPIN, false); func();
                }
            });
            hbox.add_child(btn);
        }
        addButtonItem('application-x-addon-symbolic', () => {
            item._getTopMenu().close();
            Shell.AppSystem.get_default().lookup_app('org.gnome.Extensions.desktop').activate();
        });
        if(gsettings.get_boolean(Fields.DEBUG))
            addButtonItem('applications-engineering-symbolic', () => { item._getTopMenu().close(); this._reloadShell(); });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_boolean(Fields.DISABLED, !this._disabled); this._updateMenu(); });
        addButtonItem('emblem-system-symbolic', () => { this._singleton(!this._prefs, false, false); });
        addButtonItem('mail-forward-symbolic', () => { this._singleton(false, !this._url, false); });
        addButtonItem('edit-delete-symbolic', () => { this._singleton(false, false, !this._delete); });
        if(!this._disabled)
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

    _singleton(x, y, z) {
        gsettings.set_boolean(Fields.URL, y);
        gsettings.set_boolean(Fields.PREFS, x);
        gsettings.set_boolean(Fields.DELETE, z);
        this._updateMenu();
    }

    _updateMenu() {
        this._button.menu.removeAll();
        let scroll = new PopupScrollMenu();
        if(this._unpin) {
            let list = this._unpinlist;
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .map(x => ExtManager.lookup(x))
                .forEach(x => { scroll.addMenuItem(this._pinItemMaker(x, list.has(x.uuid))); });
        } else {
            ExtManager.getUuids()
                .sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))
                .filter(x => !this._unpinlist.has(x))
                .map(x => ExtManager.lookup(x))
                .filter(x => !this._disabled || x.state === ExtState.ENABLED)
                .forEach(x => { scroll.addMenuItem(this._menuItemMaker(x)); });
        }
        this._button.menu.addMenuItem(scroll);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    enable() {
        this._addButton();
        this._stateChangeId = ExtManager.connect('extension-state-changed', this._updateMenu.bind(this));
    }

    disable() {
        if(this._stateChangeId) ExtManager.disconnect(this._stateChangeId), this._stateChangeId = 0;
        this._button.destroy();
    }
});

function init() {
    return new ExtensionList();
}

