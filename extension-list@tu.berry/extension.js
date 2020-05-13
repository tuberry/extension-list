// vim:fdm=syntax
// by tuberry

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject } = imports.gi;
const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;

const ExtensionList = GObject.registerClass(
class ExtensionList extends GObject.Object {
    _init() {
        super._init();
    }

    _addButton() {
        this._button = new PanelMenu.Button(null);
        this._icon = new St.Icon({ icon_name: 'application-x-addon-symbolic', style_class: 'extension-list-indicator system-status-icon' });
        this._button.add_actor(this._icon);
        Main.panel.addToStatusArea('extension-list@tu.berry', this._button);
        this._clickedId = this._button.connect('button_press_event', this._updateMenu.bind(this));
        this._updateMenu();
    }

    _menuItemMaker(uuid) {
        let extension = Main.extensionManager.lookup(uuid);
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'extension-list-item' });
        item.setOrnament(extension.state === ExtensionUtils.ExtensionState.ENABLED ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        item.connect('button_press_event', () => {
            item._ornament === PopupMenu.Ornament.NONE ? Main.extensionManager.enableExtension(uuid) : Main.extensionManager.disableExtension(uuid);
            this._updateMenu();
        });
        item.add_child(new St.Label({ text: extension.metadata.name, x_expand: true }));
        let hbox = new St.BoxLayout({ x_align: St.Align.END });
        let addButtonItem = (ok, icon, func) => {
            let button = new St.Button({
                style_class: 'extension-list-setting-button',
                child: new St.Icon({
                    style_class:'popup-menu-icon',
                    icon_name: ok ? icon : 'action-unvailable-symbolic',
                }),
            });
            button.connect('clicked', () => {
                item._getTopMenu().close();
                if(ok) func();
            });
            hbox.add_child(button);
        }
        addButtonItem(extension.hasPrefs, 'emblem-system-symbolic', () => { Util.spawn(["gnome-extensions", "prefs", uuid]); });
        addButtonItem(extension.metadata.url, 'emblem-symbolic-link', () => { Util.spawn(["gio", "open", extension.metadata.url]); });
        addButtonItem(true, 'edit-delete-symbolic', () => { Util.spawn(["gnome-extensions", "uninstall", uuid]); this._updateMenu(); });
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
        this._addButton();
    }

    disable() {
        if(this._clickedId)
            this._button.disconnect(this._clickedId), this._clickedId = 0;
        this._button.destroy();
    }
});

function init() {
    return new ExtensionList();
}

