// vim:fdm=syntax
// by tuberry

const Main = imports.ui.main;
const Util = imports.misc.util;
const { Shell, St, GObject } = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();

const Fields = {
    URL:      'url-button',
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
        item.setOrnament(ext.state === ExtensionUtils.ExtensionState.ENABLED && !this._disabled ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        let toggle = () => { item._ornament === PopupMenu.Ornament.NONE && !this._disabled ? Main.extensionManager.enableExtension(ext.uuid) : Main.extensionManager.disableExtension(ext.uuid); };
        item.connect('button-press-event', toggle);
        item.add_child(new St.Label({ text: (ext.type == ExtensionUtils.ExtensionType.SYSTEM &&  !this._delete ? '* ' : '') + ext.metadata.name, x_expand: true }));
        let hbox = new St.BoxLayout({ x_align: St.Align.START });
        let addButtonItem = (ok, icon, func) => {
            let button = new St.Button({
                style_class: 'extension-list-setting-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', style: ok ? '' : 'color: transparent;', }),
            });
            button.connect('clicked', () => {
                item._getTopMenu().close();
                ok ? func() : toggle();
            });
            hbox.add_child(button);
        }
        if(this._prefs)  addButtonItem(ext.hasPrefs, 'emblem-system-symbolic', () => { Util.spawn(['gnome-extensions', 'prefs', ext.uuid]); });
        if(this._url)    addButtonItem(ext.metadata.url, 'mail-forward-symbolic', () => { Util.spawn(["gio", "open", ext.metadata.url]); });
        if(this._delete) addButtonItem(ext.type != ExtensionUtils.ExtensionType.SYSTEM, 'edit-delete-symbolic', () => { Util.spawn(["gnome-extensions", "uninstall", ext.uuid]); this._updateMenu(); });
        item.add_child(hbox);
        return item;
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let button = new St.Button({
                x_expand: true,
                style_class: 'extension-list-prefs-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            button.connect('clicked', func);
            hbox.add_child(button);
        }
        addButtonItem('application-x-addon-symbolic', () => { item._getTopMenu().close(); Util.spawn(['gnome-extensions-app']); });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_boolean(Fields.DISABLED, !this._disabled); });
        addButtonItem('emblem-system-symbolic', () => { gsettings.set_boolean(Fields.PREFS, !this._prefs); });
        addButtonItem('mail-forward-symbolic', () => { gsettings.set_boolean(Fields.URL, !this._url); });
        addButtonItem('edit-delete-symbolic', () => { gsettings.set_boolean(Fields.DELETE, !this._delete); });
        item.add_child(hbox);
        return item;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        let uuids = Main.extensionManager.getUuids().sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
        let extensions = uuids.map(x => Main.extensionManager.lookup(x));
        if(this._disabled) extensions = extensions.filter(x => x.state === ExtensionUtils.ExtensionState.ENABLED);
        extensions.forEach(x => { this._button.menu.addMenuItem(this._menuItemMaker(x)); });
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    enable() {
        this._fetchSettings();
        this._addButton();
        this._settingId = gsettings.connect('changed', () => { this._fetchSettings(); this._updateMenu(); });
        this._stateChangeId = Main.extensionManager.connect('extension-state-changed', this._updateMenu.bind(this));
    }

    disable() {
        if(this._settingId) gsettings.disconnect(this._settingId), this._settingId = 0;
        if(this._stateChangeId) Main.extensionManager.disconnect(this._stateChangeId), this._stateChangeId = 0;
        this._button.destroy();
    }
});

function init() {
    return new ExtensionList();
}

