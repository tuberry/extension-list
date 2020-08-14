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
    URL:      'url-button',
    DEBUG:    'debug-button',
    PREFS:    'prefs-button',
    DELETE:   'delete-button',
    DISABLED: 'hide-disabled',
};

const ExtensionList = GObject.registerClass(
class ExtensionList extends GObject.Object {
    _init() {
        super._init();
    }

    _fetchSettings() {
        this._url      = gsettings.get_boolean(Fields.URL);
        this._prefs    = gsettings.get_boolean(Fields.PREFS);
        this._delete   = gsettings.get_boolean(Fields.DELETE);
        this._disabled = gsettings.get_boolean(Fields.DISABLED);
    }

    _addButton() {
        this._button = new PanelMenu.Button(null);
        this._button.add_actor(new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _menuItemMaker(ext) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
        item.setOrnament(ext.state == ExtState.ENABLED && !this._disabled ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        let toggle = () => { item._ornament == PopupMenu.Ornament.NONE && !this._disabled ? ExtManager.enableExtension(ext.uuid) : ExtManager.disableExtension(ext.uuid); };
        item.connect('activate', () => { item._getTopMenu().close(); toggle(); });
        item.add_child(new St.Label({
            x_expand: true,
            style: ext.state == ExtState.ERROR ? 'color: red' : '',
            text: (ext.type == ExtType.SYSTEM ? '* ' : '') + ext.metadata.name,
        }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        let addButtonItem = (ok, icon, func) => {
            let btn = new St.Button({
                style_class: 'extension-list-prefs-button extension-list-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', style: ok ? '' : 'color: transparent;', }),
            });
            btn.connect('clicked', () => {
                item._getTopMenu().close();
                ok ? func() : toggle();
            });
            hbox.add_child(btn);
        }
        if(this._prefs)  addButtonItem(ext.hasPrefs, 'emblem-system-symbolic', () => { ExtManager.openExtensionPrefs(ext.uuid, '', {}); });
        if(this._url)    addButtonItem(ext.metadata.url, 'mail-forward-symbolic', () => { Util.spawn(["gio", "open", ext.metadata.url]); });
        if(this._delete) addButtonItem(ext.type != ExtType.SYSTEM, 'edit-delete-symbolic', () => {
            ExtDownloader.uninstallExtension(ext.uuid);
            this._updateMenu();
        });
        item.add_child(hbox);
        return item;
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                hover: true,
                x_expand: true,
                style_class: 'extension-list-setting-button extension-list-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        }
        let singleton = (x, y, z) => {
            gsettings.set_boolean(Fields.URL, y);
            gsettings.set_boolean(Fields.PREFS, x);
            gsettings.set_boolean(Fields.DELETE, z);
        }
        addButtonItem('application-x-addon-symbolic', () => {
            item._getTopMenu().close();
            Shell.AppSystem.get_default().lookup_app('org.gnome.Extensions.desktop').activate();
        });
        if(gsettings.get_boolean(Fields.DEBUG))
            addButtonItem('applications-engineering-symbolic', () => {
                item._getTopMenu().close();
                if(Meta.is_wayland_compositor()) {
                    Util.spawn(['dbus-run-session', '--', 'gnome-shell', '--nested', '--wayland']);
                } else {
                    Meta.restart(_("Restarting…"));
                }
            });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_boolean(Fields.DISABLED, !this._disabled); });
        addButtonItem('emblem-system-symbolic', () => {
            this._disabled ? singleton(!this._prefs, false, false) : gsettings.set_boolean(Fields.PREFS, !this._prefs);
        });
        addButtonItem('mail-forward-symbolic', () => {
            this._disabled ? singleton(false, !this._url, false) : gsettings.set_boolean(Fields.URL, !this._url);
        });
        addButtonItem('edit-delete-symbolic', () => {
            this._disabled ? singleton(false, false, !this._delete) : gsettings.set_boolean(Fields.DELETE, !this._delete);
        });
        item.add_child(hbox);
        return item;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        let uuids = ExtManager.getUuids().sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
        let extensions = uuids.map(x => ExtManager.lookup(x));
        if(this._disabled) extensions = extensions.filter(x => x.state === ExtState.ENABLED);
        extensions.forEach(x => { this._button.menu.addMenuItem(this._menuItemMaker(x)); });
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    enable() {
        this._fetchSettings();
        this._addButton();
        this._settingId = gsettings.connect('changed', () => { this._fetchSettings(); this._updateMenu(); });
        this._stateChangeId = ExtManager.connect('extension-state-changed', this._updateMenu.bind(this));
    }

    disable() {
        if(this._settingId) gsettings.disconnect(this._settingId), this._settingId = 0;
        if(this._stateChangeId) ExtManager.disconnect(this._stateChangeId), this._stateChangeId = 0;
        this._button.destroy();
    }
});

function init() {
    return new ExtensionList();
}

