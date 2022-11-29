// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject, Meta, Gio, Shell, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtDownloader = imports.ui.extensionDownloader;
const ExtManager = Main.extensionManager;
const ExtState = ExtensionUtils.ExtensionState;
const ExtType = ExtensionUtils.ExtensionType;
const Me = ExtensionUtils.getCurrentExtension();
const { Fields, Field, Icons } = Me.imports.fields;
const _ = ExtensionUtils.gettext;

const Style = {
    [ExtState.ERROR]:       'error',
    [ExtState.OUT_OF_DATE]: 'outdate',
};

const genIcon = x => Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child(`${x}.svg`).get_path());

class ExIconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(cbs) {
        super({ activate: false });
        this._box = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        cbs.map(x => this.mkButton('extension-list-setting-button extension-list-button', ...x)).forEach(x => this._box.add_child(x));
        this.add_child(this._box);
    }

    mkButton(style_class, icon_name, callback) {
        let btn = new St.Button({ x_expand: true, style_class, child: new St.Icon({ style_class: 'popup-menu-icon' }) });
        if(icon_name === Icons.EOPEN) btn.child.set_gicon(genIcon(icon_name));
        else btn.child.set_icon_name(icon_name);
        btn.connect('clicked', callback);
        btn._icon_name = icon_name;
        return btn;
    }

    setViz(icon, viz) {
        let btn = this._box.get_children().find(x => x._icon_name === icon);
        if(btn) btn.visible = viz;
    }
}

class ExtItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext) {
        super({ style_class: 'extension-list-item popup-menu-item' });
        this.connect('activate', () => this._onActivated());
        this._label = new St.Label({ x_expand: true, style_class: 'extension-list-label' });
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this._button = new St.Button({ child: new St.Icon({ style_class: 'popup-menu-icon' }), style_class: 'extension-list-button' });
        this._button.connect('clicked', () => this._onButtonClicked());
        [this._label, this._button].forEach(x => this.add_child(x));
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
        if(label !== this._label.text) this._label.set_text(label);
        if(this._style === style) return;
        if(this._style) this._label.remove_style_pseudo_class(this._style);
        if(style) this._label.add_style_pseudo_class(style);
        this._style = style;
    }

    setIcon(icon) {
        if(this.icon === icon) return;
        switch(this.icon = icon) {
        case Icons.SET:
            this._button.visible = this._ext.hasPrefs;
            this._button.child.set_icon_name(icon); break;
        case Icons.DEL:
            this._button.visible = this._ext.type !== ExtType.SYSTEM;
            this._button.child.set_icon_name(icon); break;
        case Icons.URL:
            this._button.visible = !!this._ext.url;
            this._button.child.set_icon_name(icon); break;
        default:
            this._button.visible = true;
            this._button.child.set_gicon(genIcon(icon)); break;
        }
    }

    _onButtonClicked() {
        switch(this.icon) {
        case Icons.SET: this._getTopMenu().close(); ExtManager.openExtensionPrefs(this._ext.uuid, '', {}); break;
        case Icons.DEL: this._getTopMenu().close(); ExtDownloader.uninstallExtension(this._ext.uuid); break;
        case Icons.URL: this._getTopMenu().close(); Util.spawn(['gio', 'open', this._ext.url]); break;
        default: this._getTopMenu().togglePin(this._ext.uuid); break;
        }
    }

    _onActivated() {
        switch(this.icon) {
        case Icons.SET: case Icons.DEL: case Icons.URL:
            if(this._ext.state === ExtState.ENABLED) ExtManager.disableExtension(this._ext.uuid);
            else ExtManager.enableExtension(this._ext.uuid); break;
        default: this._getTopMenu().togglePin(this._ext.uuid, true); break;
        }
    }
}

class ExScrollSect extends PopupMenu.PopupMenuSection {
    constructor(list) {
        super();
        this._buildWidgets();
        this.setList(list);
    }

    setList(list) {
        let items = this._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ExtItem());
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setExtension(list[i]));
    }

    setExt(ext) {
        let items = this._getMenuItems();
        if(ext.state === ExtState.UNINSTALLED) { items.find(x => x._ext.uuid === ext.uuid)?.destroy(); return; }
        let index = items.findIndex(x => x._ext.name.localeCompare(ext.name) >= 0);
        if(items[index]?._ext.uuid === ext.uuid) items[index].setExtension(ext);
        else this.addMenuItem(new ExtItem(ext), index < 0 ? undefined : index);
    }

    _buildWidgets() {
        this.actor = new St.ScrollView({
            style: `max-height: ${Math.round(global.display.get_size()[1] * 0.55)}px`,
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

class ExtensionList {
    constructor() {
        this._buildWidgets();
        this._bindSettings();
        this._addMenuItems();
        this._bindToolSets();
        ExtManager.connectObject('extension-state-changed', this._onStateChanged.bind(this), this);
    }

    _buildWidgets() {
        this._tools = {};
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({ icon_name: Icons.ADDON, style_class: 'system-status-icon' }));
        this._button.menu.togglePin = this._togglePin.bind(this);
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _bindSettings() {
        this._field = new Field({
            extapp:   [Fields.EXTAPP,   'string'],
        }, ExtensionUtils.getSettings(), this).attach({
            unpin:    [Fields.UNPIN,    'boolean'],
            disabled: [Fields.DISABLED, 'boolean'],
            unpinned: [Fields.UPLIST,   'strv', x => new Set(x)],
            icon:     [Fields.ICON,     'uint', x => [Icons.SET, Icons.DEL, Icons.URL][x]],
        }, this, 'section');
    }

    _bindToolSets() {
        this._field.attach({
            debug:  [Fields.DEBUG,  'boolean', Icons.DEBUG],
            extbtn: [Fields.EXTBTN, 'boolean', Icons.ADDON],
            urlbtn: [Fields.URLBTN, 'boolean', Icons.URL],
            disbtn: [Fields.DISBTN, 'boolean', Icons.COOL],
            delbtn: [Fields.DELBTN, 'boolean', Icons.DEL],
            pinbtn: [Fields.PINBTN, 'boolean', Icons.EOPEN],
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
        if(this.unpin) this._menus?.section.setExt(ext);
        else if(this.disabled) this._menus?.section.setList(this.getExts());
        else if(ext.show) this._menus?.section.setExt(ext);
    }

    pin() {
        if(!this.unpin) return;
        this.setf('unpin', false);
        this._menus?.section.open();
    }

    _togglePin(uuid, once) {
        this.unpinned.has(uuid) ? this.unpinned.delete(uuid) : this.unpinned.add(uuid);
        this.setf('unpinned', [...this.unpinned]);
        if(once) this.setf('unpin', false);
    }

    _addMenuItems() {
        this._menus = {
            section: new ExScrollSect(this.getExts()),
            sep:     new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new ExIconItem([
                [Icons.ADDON, () => this._openExtApp(), this._tools.extbtn],
                [Icons.COOL,  () => { this.pin(); this.setf('disabled', !this.disabled); }],
                [Icons.DEL,   () => { this.pin(); this.setf('icon', this.icon === Icons.DEL ? 0 : 1); }],
                [Icons.URL,   () => { this.pin(); this.setf('icon', this.icon === Icons.URL ? 0 : 2); }],
                [Icons.EOPEN, () => this.setf('unpin', !this.unpin)],
                [Icons.DEBUG, () => this._reloadShell()],
            ]),
        };
        for(let p in this._menus) this._button.menu.addMenuItem(this._menus[p]);
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
        let show = !this.unpinned.has(uuid);
        let orna = this.unpin ? true : !this.disabled;
        let icon = this.unpin ? show ? Icons.EOPEN : Icons.EDOWN : this.icon;
        return { uuid, state, type, hasPrefs, name, url, show, icon, orna };
    }

    _reloadShell() {
        this._button.menu.close();
        if(Meta.is_wayland_compositor()) Util.spawn(['dbus-run-session', '--', 'gnome-shell', '--nested', '--wayland']);
        else Meta.restart(_('Restarting…'), global.context);
    }

    _openExtApp() {
        this.pin();
        this._button.menu.close();
        if(this.extapp) Shell.AppSystem.get_default().lookup_app(this.extapp.replace('Shell.', ''))?.activate();
        else Util.spawn(['gio', 'open', 'https://extensions.gnome.org/local']);
    }

    destroy() {
        this._field.detach(this);
        ExtManager.disconnectObject(this);
        this._button.destroy();
        this._button = null;
    }
}

class Extension {
    constructor() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        this._ext = new ExtensionList();
    }

    disable() {
        this._ext.destroy();
        this._ext = null;
    }
}

function init() {
    return new Extension();
}
