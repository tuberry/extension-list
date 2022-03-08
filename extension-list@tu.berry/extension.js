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
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
let gsettings = null;

const Fields = {
    UPLIST:   'unpin-list',
    ICON:     'button-icon',
    DEBUG:    'debug-button',
    UNPIN:    'unpin-button',
    DISABLED: 'hide-disabled',
};

const Icons = {
    COOL:  'face-cool',
    DEL:   'edit-delete',
    URL:   'mail-forward',
    PREFS: 'emblem-system',
    EDOWN: 'eye-not-looking',
    ADDON: 'application-x-addon',
    DEBUG: 'applications-engineering',
    EOPEN: 'eye-open-negative-filled',
};

const Style = {
    [ExtState.ERROR]:       'error',
    [ExtState.OUT_OF_DATE]: 'outdate',
};

const genIcon = x => Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child('%s-symbolic.svg'.format(x)).get_path());
const genParam = (type, name, ...dflt) => GObject.ParamSpec[type](name, name, name, GObject.ParamFlags.READWRITE, ...dflt);

class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style, callbacks) {
        super({ activate: false });
        this._style = style;
        this._hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        callbacks.forEach(xs => this.addButton(...xs));
        this.add_child(this._hbox);
    }

    addButton(icon_name, callback) {
        let btn = new St.Button({ x_expand: true, style_class: this._style, child: new St.Icon({ style_class: 'popup-menu-icon' }) });
        if(icon_name === 'eye-open-negative-filled') btn.child.set_gicon(genIcon(icon_name));
        else btn.child.set_icon_name('%s-symbolic'.format(icon_name));
        btn.connect('clicked', callback);
        this._hbox.add_child(btn);
    }
}

class ExtItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext, dis, icon) {
        super({ style_class: 'extension-list-item popup-menu-item' });
        this.connect('activate', this._onActivated.bind(this));
        this._label = new St.Label({ x_expand: true, style_class: 'extension-list-label' });
        this._button = new St.Button({ child: new St.Icon({ style_class: 'popup-menu-icon' }), style_class: 'extension-list-button' });
        this._button.connect('clicked', this._onButtonClicked.bind(this));
        [this._label, this._button].forEach(x => this.add_child(x));
        if(ext) this.setExtension(ext, dis);
        if(icon) this.setIcon(icon);
    }

    setExtension(ext, dis) {
        this._ext = ext;
        this._dis = dis;
        let label = this._ext.type === ExtType.SYSTEM ? '%s *'.format(this._ext.name) : this._ext.name;
        this.setOrnament(this._dis || this._ext.state !== ExtState.ENABLED ? PopupMenu.Ornament.NONE : PopupMenu.Ornament.DOT);
        this.setLabel(label, Style[ext.state]);
        this._checkIcon();
    }

    setLabel(label, style) {
        if(label !== this._label.text) this._label.set_text(label);
        if(this._style === style) return;
        if(this._style) this._label.remove_style_pseudo_class(this._style);
        if(style) this._label.add_style_pseudo_class(style);
        this._style = style;
    }

    _onButtonClicked() {
        switch(this._icon) {
        case Icons.PREFS: this._getTopMenu().close(); ExtManager.openExtensionPrefs(this._ext.uuid, '', {}); break;
        case Icons.DEL: this._getTopMenu().close(); ExtDownloader.uninstallExtension(this._ext.uuid); break;
        case Icons.URL: this._getTopMenu().close(); Util.spawn(['gio', 'open', this._ext.url]); break;
        default: this._togglePinned(); break;
        }
    }

    _onActivated() {
        switch(this._icon) {
        case Icons.PREFS: case Icons.DEL: case Icons.URL: this._ext.state === ExtState.ENABLED
            ? ExtManager.disableExtension(this._ext.uuid) : ExtManager.enableExtension(this._ext.uuid); break;
        default: this._togglePinned(true); break;
        }
    }

    _checkIcon() {
        switch(this._icon) {
        case Icons.PREFS: this._button.visible = this._ext.hasPrefs; break;
        case Icons.DEL: this._button.visible = this._ext.type !== ExtType.SYSTEM; break;
        case Icons.URL: this._button.visible = !!this._ext.url; break;
        default: this._button.visible = true;
        }
    }

    _togglePinned(once) {
        let unpinned = new Set(gsettings.get_strv(Fields.UPLIST));
        unpinned.has(this._ext.uuid) ? unpinned.delete(this._ext.uuid) : unpinned.add(this._ext.uuid);
        this._ext.unpinned = !this._ext.unpinned;
        this.setIcon(null);
        gsettings.set_strv(Fields.UPLIST, [...unpinned]);
        if(once) gsettings.set_boolean(Fields.UNPIN, false);
    }

    setIcon(icon) {
        if(this._icon && this._icon === icon) return;
        if((this._icon = icon)) this._button.child.set_icon_name('%s-symbolic'.format(this._icon));
        else this._button.child.set_gicon(genIcon(this._ext.unpinned ? Icons.EDOWN : Icons.EOPEN));
        this._checkIcon();
    }
}

class ScrollSection extends PopupMenu.PopupMenuSection {
    constructor(list, disabled, icon) {
        super();
        this._buildeWidgets();
        this.updateList(list, disabled, icon);
    }

    setList(list) {
        let items = this._items;
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ExtItem());
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._items.forEach((x, i) => x.setExtension(list[i], this._disabled));
    }

    updateList(list, disabled, icon) {
        this._disabled = disabled;
        this.setList(list);
        this.setIcon(icon);
    }

    setIcon(icon) {
        this._icon = icon;
        this._items.forEach(x => x.setIcon(this._icon));
    }

    updateItem(ext) {
        let items = this._items;
        if(ext.state === ExtState.UNINSTALLED) { items.find(x => x._ext.uuid === ext.uuid)?.destroy(); return; }
        let uuid = ext.uuid.toLowerCase();
        let index = items.findIndex(x => x._ext.uuid.localeCompare(uuid) >= 0);
        if(items[index]?._ext.uuid === ext.uuid) items[index].setExtension(ext);
        else this.addMenuItem(new ExtItem(ext, this._disabled, this._icon), index < 0 ? undefined : index);
    }

    get _items() {
        return this._getMenuItems();
    }

    _buildeWidgets() {
        this.actor = new St.ScrollView({
            style: 'max-height: %dpx'.format(global.display.get_size()[1] - 100),
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
}

class ExtensionList extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                icon:     genParam('uint', 'icon', 0, 2, 0),
                unpin:    genParam('boolean', 'unpin', false),
                disabled: genParam('boolean', 'disabled', false),
            },
        }, this);
    }

    constructor() {
        super();
        this.setUnpinned();
        this._addIndicator();
        this._bindSettings();
        this._addMenuItems();
        ExtManager.connectObject('extension-state-changed', this._onStateChanged.bind(this), this);
        gsettings.connectObject('changed::%s'.format(Fields.UPLIST), this.setUnpinned.bind(this), this);
    }

    _bindSettings() {
        [[Fields.ICON, 'icon'], [Fields.UNPIN, 'unpin'], [Fields.DISABLED, 'disabled']]
            .forEach(([x, y, z]) => gsettings.bind(x, this, y, z ?? Gio.SettingsBindFlags.GET));
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({ icon_name: '%s-symbolic'.format(Icons.ADDON), style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    set icon(icon) {
        this._icon = [Icons.PREFS, Icons.DEL, Icons.URL][icon];
        this._menus?.section.setIcon(this._icon);
    }

    set unpin(unpin) {
        this._unpin = unpin;
        if(this._unpin) this._menus?.section.updateList(this.extensions, false, null);
        else this._menus?.section.updateList(this.extensions, this._disabled, this._icon);
    }

    set disabled(disabled) {
        this._disabled = disabled;
        this._menus?.section.updateList(this.extensions, this._disabled, this._icon);
    }

    setUnpinned() {
        this._unpinned = new Set(gsettings.get_strv(Fields.UPLIST));
    }

    _onStateChanged(mgr_, ext) {
        let data = this.extract(ext);
        if(this._unpin) this._menus?.section.updateItem(data);
        else if(this._disabled) this._menus?.section.updateList(this.extensions, true, this._icon);
        else if(!data.unpinned) this._menus?.section.updateItem(data);
    }

    pin() {
        if(this._unpin) gsettings.set_boolean(Fields.UNPIN, false);
    }

    _addMenuItems() {
        let settings = [
            [Icons.ADDON, () => { this.pin(); this._button.menu.close(); Util.spawn(['gapplication', 'launch', 'org.gnome.Extensions']); }],
            [Icons.COOL,  () => { this.pin(); gsettings.set_boolean(Fields.DISABLED, !this._disabled); }],
            [Icons.DEL,   () => { this.pin(); gsettings.set_uint(Fields.ICON, this._icon === Icons.DEL ? 0 : 1); }],
            [Icons.URL,   () => { this.pin(); gsettings.set_uint(Fields.ICON, this._icon === Icons.URL ? 0 : 2); }],
            [Icons.EOPEN, () => { gsettings.set_boolean(Fields.UNPIN, !this._unpin); }],
        ];
        if(gsettings.get_boolean(Fields.DEBUG)) settings.unshift([Icons.DEBUG, this._reloadShell.bind(this)]);
        this._menus = {
            section:  new ScrollSection(this.extensions, this._disabled, this._unpin ? null : this._icon),
            sep:      new PopupMenu.PopupSeparatorMenuItem(),
            settings: new IconItem('extension-list-setting-button extension-list-button', settings),
        };
        for(let p in this._menus) this._button.menu.addMenuItem(this._menus[p]);
    }

    get extensions() {
        let uuids = ExtManager.getUuids().sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()));
        if(this._unpin) {
            return uuids.map(x => this.extract(ExtManager.lookup(x)));
        } else {
            return uuids.filter(x => !this._unpinned.has(x)).map(x => this.extract(ExtManager.lookup(x)))
                .filter(x => !this._disabled || x.state === ExtState.ENABLED);
        }
    }

    extract({ uuid, state, type, hasPrefs, metadata: { name, url } }) {
        return { uuid, state, type, hasPrefs, name, url, unpinned: this._unpinned.has(uuid) };
    }

    _reloadShell() {
        this._button.menu.close();
        if(Meta.is_wayland_compositor()) Util.spawn(['dbus-run-session', '--', 'gnome-shell', '--nested', '--wayland']);
        else Meta.restart(_('Restarting…'));
    }

    destroy() {
        gsettings.disconnectObject(this);
        ExtManager.disconnectObject(this);
        this._button.destroy();
        this._button = null;
    }
}

class Extension {
    static {
        ExtensionUtils.initTranslations();
    }

    enable() {
        gsettings = ExtensionUtils.getSettings();
        this._ext = new ExtensionList();
    }

    disable() {
        this._ext.destroy();
        gsettings = this._ext = null;
    }
}

function init() {
    return new Extension();
}

