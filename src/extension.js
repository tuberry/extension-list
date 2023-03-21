// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject, Shell, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtDownloader = imports.ui.extensionDownloader;
const ExtManager = Main.extensionManager;
const ExtState = ExtensionUtils.ExtensionState;
const ExtType = ExtensionUtils.ExtensionType;
const Me = ExtensionUtils.getCurrentExtension();
const { Fulu, Extension, DEventEmitter, symbiose, omit, onus } = Me.imports.fubar;
const { StButton, IconItem, TrayIcon } = Me.imports.menu;
const { Field, Icon } = Me.imports.const;
const { _ } = Me.imports.util;

const Style = {
    [ExtState.ERROR]:       'error',
    [ExtState.OUT_OF_DATE]: 'outdate',
};

class ExtMenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext) {
        super('', { style_class: 'extension-list-item popup-menu-item' });
        this.label.set_x_expand(true);
        this.label.set_style_class_name('extension-list-label');
        this.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this._btn = new StButton({
            child: new St.Icon({ style_class: 'popup-menu-icon' }),
            style_class: 'extension-list-setting',
        }, () => this._onButtonClicked());
        this.add_child(this._btn);
        if(ext) this.setExtension(ext);
    }

    setExtension(ext) {
        this._ext = ext;
        let label = this._ext.type === ExtType.SYSTEM ? `${this._ext.name} *` : this._ext.name;
        this.setOrnament(this._ext.orna && this._ext.state === ExtState.ENABLED ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        this.setLabel(label, Style[ext.state]);
        this.setIcon(this._ext.icon);
    }

    setLabel(label, style) {
        this.label.set_text(label);
        if(this._style === style) return;
        if(this._style) this.label.remove_style_pseudo_class(this._style);
        if(style) this.label.add_style_pseudo_class(style);
        this._style = style;
    }

    setIcon(icon) {
        if(this.icon === icon) return;
        this._btn.visible = (x => {
            switch(x) { // need guard/match
            case Icon.DEL: return this._ext.type !== ExtType.SYSTEM;
            case Icon.SET: return this._ext.hasPrefs;
            case Icon.URL: return !!this._ext.url;
            default: return true;
            }
        })(this.icon = icon);
        if(this._btn.visible) this._btn.child.set_icon_name(icon);
    }

    _onButtonClicked() {
        switch(this.icon) {
        case Icon.SET: this._getTopMenu().close(); ExtManager.openExtensionPrefs(this._ext.uuid, '', {}); break;
        case Icon.DEL: this._getTopMenu().close(); ExtDownloader.uninstallExtension(this._ext.uuid); break;
        case Icon.URL: this._getTopMenu().close(); Util.spawn(['gio', 'open', this._ext.url]); break;
        default: this._getTopMenu().togglePin(this._ext.uuid); break;
        }
    }

    activate(event) {
        super.activate(event);
        switch(this.icon) {
        case Icon.SET: case Icon.DEL: case Icon.URL:
            if(this._ext.state === ExtState.ENABLED) ExtManager.disableExtension(this._ext.uuid);
            else ExtManager.enableExtension(this._ext.uuid); break;
        default: this._getTopMenu().togglePin(this._ext.uuid, true); break;
        }
    }
}

class ExtScrollSect extends PopupMenu.PopupMenuSection {
    constructor(list) {
        super();
        this._buildWidgets();
        this.setList(list);
    }

    setList(list) {
        let items = this._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ExtMenuItem());
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setExtension(list[i]));
    }

    setExtension(ext) {
        let items = this._getMenuItems();
        if(ext.state === ExtState.UNINSTALLED) return items.find(x => x._ext.uuid === ext.uuid)?.destroy();
        let index = items.findIndex(x => x._ext.name.localeCompare(ext.name) >= 0);
        if(items[index]?._ext.uuid === ext.uuid) items[index].setExtension(ext);
        else this.addMenuItem(new ExtMenuItem(ext), index < 0 ? undefined : index);
    }

    _buildWidgets() {
        this.actor = new St.ScrollView({
            style: `max-height: ${Math.round(global.display.get_size().at(1) * 0.55)}px`,
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

class ExtensionList extends DEventEmitter {
    constructor() {
        super();
        this._buildWidgets();
        this._bindSettings();
        this._addMenuItems();
        this._bindToolSets();
        symbiose(this, () => omit(this, '_btn'));
        ExtManager.connectObject('extension-state-changed', this._onStateChanged.bind(this), onus(this));
    }

    _buildWidgets() {
        this._tools = {};
        this._btn = Main.panel.addToStatusArea(Me.metadata.uuid, new PanelMenu.Button(0.5, Me.metadata.uuid));
        this._btn.menu.togglePin = this._togglePin.bind(this);
        this._btn.add_actor(new TrayIcon(Icon.ADN));
    }

    _bindSettings() {
        this._fulu = new Fulu({
            extapp:   [Field.APP, 'string'],
        }, ExtensionUtils.getSettings(), this).attach({
            unpin:    [Field.TPN, 'boolean'],
            disabled: [Field.HDS, 'boolean'],
            unpinned: [Field.UPN, 'strv', x => new Set(x)],
            icon:     [Field.BTN, 'uint', x => [Icon.SET, Icon.DEL, Icon.URL][x]],
        }, this, 'section');
    }

    _bindToolSets() {
        this._fulu.attach({
            extbtn: [Field.EXT, 'boolean', Icon.ADN],
            urlbtn: [Field.URL, 'boolean', Icon.URL],
            disbtn: [Field.DIS, 'boolean', Icon.COOL],
            delbtn: [Field.DEL, 'boolean', Icon.DEL],
            pinbtn: [Field.PIN, 'boolean', Icon.SHOW],
        }, this, 'tools');
    }

    set tools([k, v, out]) {
        this._tools[k] = v;
        this._menus?.prefs.setViz(out, v);
        this._checkTools();
    }

    _checkTools() {
        if(Object.values(this._tools).reduce((p, v) => p | v, false)) {
            this._menus?.prefs.show();
            this._menus?.sep.show();
        } else {
            this._menus?.prefs.hide();
            this._menus?.sep.hide();
        }
    }

    set section([k, v, out]) {
        this[k] = out ? out(v) : v;
        this._menus?.section.setList(this.getExts());
    }

    _onStateChanged(_m, extension) {
        let ext = this.extract(extension);
        if(this.unpin) this._menus?.section.setExtension(ext);
        else if(this.disabled) this._menus?.section.setList(this.getExts());
        else if(ext.show) this._menus?.section.setExtension(ext);
    }

    pin() {
        if(!this.unpin) return;
        this._fulu.set('unpin', false, this);
        this._menus?.section.open();
    }

    _togglePin(uuid, once) {
        this.unpinned.has(uuid) ? this.unpinned.delete(uuid) : this.unpinned.add(uuid);
        this._fulu.set('unpinned', [...this.unpinned], this);
        if(once) this._fulu.set('unpin', false, this);
    }

    _addMenuItems() {
        this._menus = {
            section: new ExtScrollSect(this.getExts()),
            sep:     new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new IconItem('extension-list-setting', [
                [Icon.ADN,  () => this._openExtApp(), this._tools.extbtn],
                [Icon.COOL, () => { this.pin(); this._fulu.set('disabled', !this.disabled, this); }],
                [Icon.DEL,  () => { this.pin(); this._fulu.set('icon', this.icon === Icon.DEL ? 0 : 1, this); }],
                [Icon.URL,  () => { this.pin(); this._fulu.set('icon', this.icon === Icon.URL ? 0 : 2, this); }],
                [Icon.SHOW, () => this._fulu.set('unpin', !this.unpin, this)],
            ]),
        };
        for(let p in this._menus) this._btn.menu.addMenuItem(this._menus[p]);
    }

    getExts() {
        let ret = Array.from(ExtManager._extensions.values()).map(x => this.extract(x));
        if(!this.unpin) {
            ret = ret.filter(x => x.show);
            if(this.disabled) ret = ret.filter(x => x.state === ExtState.ENABLED);
        }
        return ret.sort((a, b) => a.name.localeCompare(b.name));
    }

    extract({ uuid, state, type, hasPrefs, metadata: { name, url } }) {
        let show = !this.unpinned.has(uuid),
            orna = this.unpin ? true : !this.disabled,
            icon = this.unpin ? show ? Icon.SHOW : Icon.HIDE : this.icon;
        return { uuid, state, type, hasPrefs, name, url, show, icon, orna };
    }

    _openExtApp() {
        this.pin();
        this._btn.menu.close();
        if(this.extapp) Shell.AppSystem.get_default().lookup_app(this.extapp)?.activate();
        else Util.spawn(['gio', 'open', 'https://extensions.gnome.org/local']);
    }
}

function init() {
    return new Extension(ExtensionList);
}
