// vim:fdm=syntax
// by tuberry

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject } = imports.gi;
const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const gsettings = ExtensionUtils.getSettings();
const Fields = Me.imports.prefs.Fields;

const unicode = x => x.includes('\\u') ? eval("'" + x + "'") : x;

const ExtensionList = GObject.registerClass(
class ExtensionList extends GObject.Object {
    _init() {
        super._init();
    }

    _addButton(txt) {
        this._clicked = false; // update menu when first clicking
        this._button = new PanelMenu.Button(null);
        this._label = new St.Label({ text: txt, style_class: 'extension-list-indicator' });
        this._button.add_actor(this._label);
        Main.panel.addToStatusArea('extension-list@tu.berry', this._button);
        this._clickedId = this._button.connect('button_press_event', () => { if(!this._clicked) this._updateMenu(), this._clicked = true; });
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
            if(!ok) return;
            let button = new St.Button({
                style_class: 'extension-list-setting-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon' }),
            });
            button.connect('clicked', () => {
                item._getTopMenu().close();
                func();
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
        let text = gsettings.get_string(Fields.INDICATOR);
        this._addButton(text ? unicode(text) : '\uF12E');
        this._textId = gsettings.connect(`changed::${Fields.INDICATOR}`, () => {
            let text = gsettings.get_string(Fields.INDICATOR);
            this._label.set_text(text ? unicode(text) : '\uF12E');
        })
    }

    disable() {
        if(this._clickedId)
            this._button.disconnect(this._clickedId), this._clickedId = 0;
        if(this._textId)
            this._label.disconnect(this._textId), this._textId = 0;
        this._button.destroy();
    }
});

function init() {
    return new ExtensionList();
}

