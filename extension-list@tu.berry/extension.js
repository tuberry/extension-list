// vim:fdm=syntax
// by tuberry

const Main = imports.ui.main;
const Util = imports.misc.util;
const { St, GObject } = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const Fields = Me.imports.prefs.Fields;

const ExtensionList = GObject.registerClass(
class ExtensionList extends GObject.Object {
    _init() {
        super._init();
    }

    _fetchSettings() {
        this._url    = gsettings.get_boolean(Fields.URL);
        this._prefs  = gsettings.get_boolean(Fields.PREFS);
        this._delete = gsettings.get_boolean(Fields.DELETE);
    }

    _addButton() {
        this._button = new PanelMenu.Button(null);
        this._button.add_actor(new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'extension-list-indicator system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _menuItemMaker(uuid) {
        let extension = Main.extensionManager.lookup(uuid);
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
        item.setOrnament(extension.state === ExtensionUtils.ExtensionState.ENABLED ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        item.connect('button-press-event', () => {
            item._ornament === PopupMenu.Ornament.NONE ? Main.extensionManager.enableExtension(uuid) : Main.extensionManager.disableExtension(uuid);
        });
        item.add_child(new St.Label({ text: (extension.type == ExtensionUtils.ExtensionType.SYSTEM &&  !this._delete ? '* ' : '') + extension.metadata.name, x_expand: true }));
        let hbox = new St.BoxLayout({ x_align: St.Align.END });
        let addButtonItem = (ok, icon, func) => {
            let button = new St.Button({
                style_class: 'extension-list-setting-button',
                child: new St.Icon({
                    icon_name: icon,
                    style_class: 'popup-menu-icon',
                    style: ok ? '' : 'color: transparent;',
                }),
            });
            button.connect('clicked', () => {
                item._getTopMenu().close();
                if(ok) func(); else item._ornament === PopupMenu.Ornament.NONE ? Main.extensionManager.enableExtension(uuid) : Main.extensionManager.disableExtension(uuid);
            });
            hbox.add_child(button);
        }
        if(this._prefs)  addButtonItem(extension.hasPrefs, 'emblem-system-symbolic', () => { Main.extensionManager.openExtensionPrefs(uuid, '', {}); });
        if(this._url)    addButtonItem(extension.metadata.url, 'mail-forward-symbolic', () => { Util.spawn(["gio", "open", extension.metadata.url]); });
        if(this._delete) addButtonItem(extension.type != ExtensionUtils.ExtensionType.SYSTEM, 'edit-delete-symbolic', () => { Util.spawn(["gnome-extensions", "uninstall", uuid]); this._updateMenu(); });
        item.add_child(hbox);
        return item;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        let uuids = Main.extensionManager.getUuids().sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
        uuids.forEach(x => { this._button.menu.addMenuItem(this._menuItemMaker(x)); });

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addSettingsAction(_("Launch Extensions"), 'org.gnome.Extensions.desktop');
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

