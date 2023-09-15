// vim:fdm=syntax
// by tuberry

import St from 'gi://St';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as ExtDownloader from 'resource:///org/gnome/shell/ui/extensionDownloader.js';

import { Field, Icon } from './const.js';
import { IconButton, IconItem, TrayIcon } from './menu.js';
import { Fulu, BaseExtension, Destroyable, manageSource, omit, getSignalHolder, getSelf, _ } from './fubar.js';

const ExtManager = Main.extensionManager;
const ExtType = ExtensionUtils.ExtensionType;
const ExtState = ExtensionUtils.ExtensionState;

class ExtMenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext) {
        super('', { style_class: 'extension-list-item popup-menu-item' });
        this.label.set_x_expand(true);
        this.label.set_style_class_name('extension-list-label');
        this.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this._btn = new IconButton({ style_class: 'extension-list-setting' }, () => this._onButtonClicked());
        this.add_child(this._btn);
        if(ext) this.setExtension(ext);
    }

    setExtension(ext) {
        this._ext = ext;
        let label = this._ext.type === ExtType.SYSTEM ? `${this._ext.name} *` : this._ext.name;
        this.setOrnament(this._ext.orna && this._ext.state === ExtState.ENABLED ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        this.setLabel(label, { [ExtState.ERROR]: 'error', [ExtState.OUT_OF_DATE]: 'outdate' }[ext.state]);
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
        if(this._btn.visible) this._btn.setIcon(icon);
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
            style: `max-height: ${Math.round(global.display.get_size().at(1) * 0.9)}px`,
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

class ExtensionList extends Destroyable {
    constructor(gset) {
        super();
        this._buildWidgets();
        this._bindSettings(gset);
        this._addMenuItems();
        this._bindToolSets();
        manageSource(this, () => omit(this, '_btn'));
        ExtManager.connectObject('extension-state-changed', this._onStateChanged.bind(this), getSignalHolder(this));
    }

    _buildWidgets() {
        this._tools = {};
        this._btn = Main.panel.addToStatusArea(getSelf().uuid, new PanelMenu.Button(0.5));
        this._btn.menu.togglePin = this._togglePin.bind(this);
        this._btn.add_actor(new TrayIcon(Icon.ADN));
    }

    _bindSettings(gset) {
        this._fulu = new Fulu({
            extapp:   [Field.APP, 'string'],
        }, gset, this).attach({
            unpin:    [Field.TPN, 'boolean'],
            disabled: [Field.HDS, 'boolean'],
            unpinned: [Field.UPN, 'strv', x => new Set(x)],
            icon:     [Field.BTN, 'uint', x => [Icon.SET, Icon.DEL, Icon.URL][x]],
        }, this, 'section');
    }

    _bindToolSets() {
        this._fulu.attach({
            extbtn: [Field.EXT, 'boolean'],
            urlbtn: [Field.URL, 'boolean'],
            disbtn: [Field.DIS, 'boolean'],
            delbtn: [Field.DEL, 'boolean'],
            pinbtn: [Field.PIN, 'boolean'],
        }, this, 'tools');
    }

    set tools([k, v]) {
        this._tools[k] = v;
        this._menus?.prefs.setViz(k, v);
        this._checkTools();
    }

    _checkTools() {
        let viz = Object.values(this._tools).reduce((a, x) => a | x, false) ? 'show' : 'hide';
        this._menus?.prefs[viz]();
        this._menus?.sep[viz]();
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
            prefs:   new IconItem('extension-list-setting', {
                extbtn: [() => this._openExtApp(), Icon.ADN],
                disbtn: [() => {
                    this.pin(); this._fulu.set('disabled', !this.disabled, this);
                }, this.disabled, Icon.HIDE, Icon.SHOW],
                delbtn: [() => {
                    this.pin(); this._fulu.set('icon', this.icon === Icon.DEL ? 0 : 1, this);
                    this._menus.prefs._icons.urlbtn.setIcon(Icon.URL);
                }, this.icon !== Icon.DEL, Icon.DEL, Icon.SET],
                urlbtn: [() => {
                    this.pin(); this._fulu.set('icon', this.icon === Icon.URL ? 0 : 2, this);
                    this._menus.prefs._icons.delbtn.setIcon(Icon.DEL);
                }, this.icon !== Icon.URL, Icon.URL, Icon.SET],
                pinbtn: [() => this._fulu.set('unpin', !this.unpin, this), Icon.PIN],
            }),
        };
        Object.values(this._menus).forEach(x => this._btn.menu.addMenuItem(x));
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

export default class Extension extends BaseExtension { $klass = ExtensionList; }
