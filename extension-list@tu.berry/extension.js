// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { St, GObject, Meta, Gio, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const ExtDownloader = imports.ui.extensionDownloader;
const ExtManager = Main.extensionManager;
const ExtState = ExtensionUtils.ExtensionState;
const ExtType = ExtensionUtils.ExtensionType;
const Me = ExtensionUtils.getCurrentExtension();
const { Fields, Icons } = Me.imports.fields;
const _ = ExtensionUtils.gettext;

const Style = {
    [ExtState.ERROR]:       'error',
    [ExtState.OUT_OF_DATE]: 'outdate',
};

const genIcon = x => Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child(`${x}-symbolic.svg`).get_path());

class Field {
    constructor(prop, gset, obj) {
        this.gset = typeof gset === 'string' ? new Gio.Settings({ schema: gset }) : gset;
        this.prop = prop;
        this.bind(obj);
    }

    _get(x) {
        return this.gset[`get_${this.prop[x][1]}`](this.prop[x][0]);
    }

    _set(x, y) {
        this.gset[`set_${this.prop[x][1]}`](this.prop[x][0], y);
    }

    bind(a) {
        let fs = Object.entries(this.prop);
        fs.forEach(([x]) => { a[x] = this._get(x); });
        this.gset.connectObject(...fs.flatMap(([x, [y]]) => [`changed::${y}`, () => { a[x] = this._get(x); }]), a);
    }

    unbind(a) {
        this.gset.disconnectObject(a);
    }
}

class ELIconItem extends PopupMenu.PopupBaseMenuItem {
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

    addButton(icon_name, callback, visible) {
        let btn = new St.Button({
            x_expand: true, visible, style_class: this._style,
            child: new St.Icon({ style_class: 'popup-menu-icon' }),
        });
        if(icon_name === Icons.EOPEN) btn.child.set_gicon(genIcon(icon_name));
        else btn.child.set_icon_name(`${icon_name}-symbolic`);
        btn.connect('clicked', callback);
        btn._icon_name = icon_name;
        this._hbox.add_child(btn);
    }

    setViz(icon, viz) {
        let btn = this._hbox.get_children().find(x => x._icon_name === icon);
        if(btn) btn.visible = viz;
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
        let label = this._ext.type === ExtType.SYSTEM ? `${this._ext.name} *` : this._ext.name;
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
        case Icons.DEL:   this._getTopMenu().close(); ExtDownloader.uninstallExtension(this._ext.uuid); break;
        case Icons.URL:   this._getTopMenu().close(); Util.spawn(['gio', 'open', this._ext.url]); break;
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
        let unpinned = new Set(this._parent.unpinned);
        unpinned.has(this._ext.uuid) ? unpinned.delete(this._ext.uuid) : unpinned.add(this._ext.uuid);
        this._ext.unpinned = !this._ext.unpinned;
        this.setIcon(null);
        this._parent.setUnpinned([...unpinned]);
        if(once) this._parent.setUnpin(false);
    }

    setIcon(icon) {
        if(this._icon && this._icon === icon) return;
        if((this._icon = icon)) this._button.child.set_icon_name(`${this._icon}-symbolic`);
        else this._button.child.set_gicon(genIcon(this._ext.unpinned ? Icons.EDOWN : Icons.EOPEN));
        this._checkIcon();
    }
}

class ScrollSection extends PopupMenu.PopupMenuSection {
    constructor(list, disabled, icon) {
        super();
        this._field = new Field({
            unpinned: [Fields.UPLIST, 'strv'],
            unpin:    [Fields.UNPIN,  'boolean'],
        }, ExtensionUtils.getSettings(), this);
        this._buildeWidgets();
        this.updateList(list, disabled, icon);
    }

    setUnpin(unpin) {
        this._field._set('unpin', unpin);
    }

    setUnpinned(uplist) {
        this._field._set('unpinned', uplist);
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

    destroy() {
        this._field.unbind(this);
        super.destroy();
    }
}

class ExtensionList {
    constructor() {
        this._buildWidgets();
        this._bindSettings();
        this._addMenuItems();
        ExtManager.connectObject('extension-state-changed', this._onStateChanged.bind(this), this);
    }

    _bindSettings() {
        this._field = new Field({
            unpinned: [Fields.UPLIST,   'strv'],
            icon:     [Fields.ICON,     'uint'],
            unpin:    [Fields.UNPIN,    'boolean'],
            disabled: [Fields.DISABLED, 'boolean'],
            debug:    [Fields.DEBUG,    'boolean'],
            extbtn:   [Fields.EXTBTN,   'boolean'],
            urlbtn:   [Fields.URLBTN,   'boolean'],
            disbtn:   [Fields.DISBTN,   'boolean'],
            delbtn:   [Fields.DELBTN,   'boolean'],
            pinbtn:   [Fields.PINBTN,   'boolean'],
            extapp:   [Fields.EXTAPP,   'string'],
        }, ExtensionUtils.getSettings(), this);
    }

    _buildWidgets() {
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({ icon_name: `${Icons.ADDON}-symbolic`, style_class: 'system-status-icon' }));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        this._viz = {};
    }

    set debug(viz) {
        this.viz = ['_debug', viz, Icons.DEBUG];
    }

    set extbtn(viz) {
        this.viz = ['_extbtn', viz, Icons.ADDON];
    }

    set urlbtn(viz) {
        this.viz = ['_urlbtn', viz, Icons.URL];
    }

    set disbtn(viz) {
        this.viz = ['_disbtn', viz, Icons.COOL];
    }

    set delbtn(viz) {
        this.viz = ['_delbtn', viz, Icons.DEL];
    }

    set pinbtn(viz) {
        this.viz = ['_pinbtn', viz, Icons.EOPEN];
    }

    set viz([k, v, ic]) {
        this._viz[k] = v;
        this._menus?.settings.setViz(ic, v);
        if(Object.values(this._viz).reduce((a, c) => a | c, false)) {
            this._menus?.settings.show();
            this._menus?.sep.show();
        } else {
            this._menus?.settings.hide();
            this._menus?.sep.hide();
        }
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

    set unpinned(uplist) {
        this._unpinned = new Set(uplist);
    }

    _onStateChanged(mgr_, ext) {
        let data = this.extract(ext);
        if(this._unpin) this._menus?.section.updateItem(data);
        else if(this._disabled) this._menus?.section.updateList(this.extensions, true, this._icon);
        else if(!data.unpinned) this._menus?.section.updateItem(data);
    }

    pin() {
        if(!this._unpin) return;
        this._field._set('unpin', false);
        this._menus?.section.open();
    }

    _addMenuItems() {
        let settings = [
            [Icons.ADDON, this._openExtApp.bind(this), this._viz._extbtn],
            [Icons.COOL,  () => { this.pin(); this._field._set('disabled', !this._disabled); }, this._viz._disbtn],
            [Icons.DEL,   () => { this.pin(); this._field._set('icon', this._icon === Icons.DEL ? 0 : 1); }, this._viz._delbtn],
            [Icons.URL,   () => { this.pin(); this._field._set('icon', this._icon === Icons.URL ? 0 : 2); }, this._viz._urlbtn],
            [Icons.EOPEN, () => this._field._set('unpin', !this._unpin), this._viz._pinbtn],
            [Icons.DEBUG, this._reloadShell.bind(this), this._viz._debug],
        ];
        this._menus = {
            section:  new ScrollSection(this.extensions, this._disabled, this._unpin ? null : this._icon),
            sep:      new PopupMenu.PopupSeparatorMenuItem(),
            settings: new ELIconItem('extension-list-setting-button extension-list-button', settings),
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

    _openExtApp() {
        this.pin();
        this._button.menu.close();
        if(this.extapp) Shell.AppSystem.get_default().lookup_app(this.extapp.replace('Shell.', '')).activate();
        else Util.spawn(['gio', 'open', 'https://extensions.gnome.org/local']);
    }

    destroy() {
        this._field.unbind(this);
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
