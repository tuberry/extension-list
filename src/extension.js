// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {uninstallExtension} from 'resource:///org/gnome/shell/ui/extensionDownloader.js';
import {ExtensionType, ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import {xnor} from './util.js';
import {Field, Icon} from './const.js';
import {IconButton, IconItem, MenuItem, PanelButton} from './menu.js';
import {Fulu, ExtensionBase, Destroyable, manageSource, omit, connect, _, open} from './fubar.js';

const Style = {[ExtensionState.ERROR]: 'state-error', [ExtensionState.OUT_OF_DATE]: 'state-outdate'};

class ExtensionItem extends MenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext) {
        super('', (...xs) => this._onActivate(...xs), {can_focus: false});
        this.add_style_class_name('extension-list-item');
        this.label.set_x_expand(true);
        this.label.add_style_class_name('extension-list-label');
        this.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this._btn = new IconButton({style_class: 'extension-list-iconbtn'}, () => this._onButtonClick());
        this.add_child(this._btn);
        if(ext) this.setExtension(ext);
    }

    setExtension(ext) {
        this._ext = ext;
        this.label.set_can_focus(ext.mutable);
        let label = this._ext.type === ExtensionType.SYSTEM ? `${this._ext.name} *` : this._ext.name;
        this.setOrnament(this._ext.orna && this._ext.state === ExtensionState.ACTIVE ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.setLabel(label, Style[ext.state] ?? (ext.mutable ? undefined : 'state-immutable'));
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
        this._btn.visible = this._getIconViz(this.icon = icon);
        if(this._btn.visible) this._btn.setIcon(icon);
    }

    _getIconViz(icon) {
        switch(icon) {
        case Icon.SET: return this._ext.prefs;
        case Icon.URL: return !!this._ext.url;
        case Icon.DEL: return this._ext.type !== ExtensionType.SYSTEM;
        default: return true;
        }
    }

    _onButtonClick() {
        switch(this.icon) {
        case Icon.SET: this._getTopMenu().close(); Main.extensionManager.openExtensionPrefs(this._ext.uuid, '', {}); break;
        case Icon.URL: this._getTopMenu().close(); open(this._ext.url); break;
        case Icon.DEL: this._getTopMenu().close(); uninstallExtension(this._ext.uuid); break;
        default: this._getTopMenu().togglePin(this._ext.uuid); break;
        }
    }

    _onActivate(_a, event) {
        switch(this.icon) {
        case Icon.SET: case Icon.DEL: case Icon.URL:
            if(event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
                this._onButtonClick();
            } else if(this._ext.mutable) {
                if(this._ext.state === ExtensionState.ACTIVE) Main.extensionManager.disableExtension(this._ext.uuid);
                else Main.extensionManager.enableExtension(this._ext.uuid); break;
            }
            break;
        default: this._getTopMenu().togglePin(this._ext.uuid, true); break;
        }
    }
}

class ExtensionScroll extends PopupMenu.PopupMenuSection {
    constructor(list) {
        super();
        this._buildWidgets();
        this.setExtensions(list);
    }

    setExtensions(list) {
        let items = this._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ExtensionItem());
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setExtension(list[i]));
    }

    updateExtension(ext) {
        let items = this._getMenuItems();
        if(ext.state === ExtensionState.UNINSTALLED) return items.find(x => x._ext.uuid === ext.uuid)?.destroy();
        let index = items.findIndex(x => x._ext.name.localeCompare(ext.name) >= 0);
        if(items[index]?._ext.uuid === ext.uuid) items[index].setExtension(ext);
        else this.addMenuItem(new ExtensionItem(ext), index < 0 ? undefined : index);
    }

    _buildWidgets() {
        this.actor = new St.ScrollView({
            child: this.box,
            clip_to_allocation: true,
            style_class: 'extension-list-view',
        });
        this.actor._delegate = this;
    }
}

class ExtensionList extends Destroyable {
    constructor(gset) {
        super();
        this._buildWidgets();
        this._bindSettings(gset);
        this._addMenuItems();
        manageSource(this, () => omit(this, '_btn'));
        connect(this, [Main.extensionManager, 'extension-state-changed', this._onStateChange.bind(this)]);
    }

    _buildWidgets() {
        this._search = '';
        this._btn = new PanelButton(Icon.ADN);
        this._btn.menu.connect('menu-closed', () => this._updateSearch(''));
        this._btn.menu.actor.connect('key-press-event', this._onKeyPress.bind(this));
        this._btn.menu.togglePin = (uuid, once) => {
            this.unpinned.has(uuid) ? this.unpinned.delete(uuid) : this.unpinned.add(uuid);
            this._fulu.set('unpinned', [...this.unpinned], this);
            if(once) this._fulu.set('unpin', false, this);
        };
    }

    _bindSettings(gset) {
        this._fulu = new Fulu({
            extapp:   [Field.APP, 'string'],
        }, gset, this).attach({
            unpin:    [Field.TPN, 'boolean'],
            inactive: [Field.HDS, 'boolean'],
            tooltip:  [Field.TIP, 'boolean'],
            unpinned: [Field.UPN, 'strv', x => new Set(x)],
            icon:     [Field.BTN, 'uint', x => [Icon.SET, Icon.DEL, Icon.URL][x]],
        }, this, 'section').attach({
            extbtn: [Field.EXT, 'boolean'],
            urlbtn: [Field.URL, 'boolean'],
            disbtn: [Field.DIS, 'boolean'],
            delbtn: [Field.DEL, 'boolean'],
            pinbtn: [Field.PIN, 'boolean'],
        }, this, 'icons');
    }

    set section([k, v, cb]) {
        this[k] = cb?.(v) ?? v;
        this._menus?.section.setExtensions(this.getExtensions());
    }

    set icons([k, v]) {
        this[k] = v;
        this._menus?.prefs.setViz(k, v);
    }

    set tooltip(tooltip) {
        if(xnor(this._tooltip, tooltip)) return;
        this._tooltip = tooltip;
        if(!this._menus) return;
        Object.entries(this._genToolbar()).forEach(([k, v]) => {
            this._menus[k].destroy();
            this._menus[k] = v;
            this._btn.menu.addMenuItem(v);
        });
    }

    _onStateChange(_m, extension) {
        let ext = this.extract(extension);
        if(this.unpin) this._menus?.section.updateExtension(ext);
        else if(this.inactive) this._menus?.section.setExtensions(this.getExtensions());
        else if(ext.show) this._menus?.section.updateExtension(ext);
    }

    pin() {
        if(!this.unpin) return;
        this._fulu.set('unpin', false, this);
    }

    _addMenuItems() {
        this._menus = {section: new ExtensionScroll(this.getExtensions()), ...this._genToolbar()};
        Object.values(this._menus).forEach(x => this._btn.menu.addMenuItem(x));
    }

    _onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(key > 32 && key < 127) this._updateSearch(this._search + String.fromCharCode(key)); // printable ASCII
        else if(key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace) this._updateSearch(this._search.slice(0, -1));
        return Clutter.EVENT_PROPAGATE;
    }

    // NOTE: just use ASCIIs instead of Unicodes(StEntry) to search since [1], [2] and [3]
    // [1] search with IME issue: https://gitlab.gnome.org/GNOME/gtk/-/issues/2636
    // [2] extension metadata L10N issue: https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/2288
    // [3] PopupMenus cover IBusPopup: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2331
    _updateSearch(search) {
        this._search = search;
        let focus = global.stage.get_key_focus();
        let items = this._menus?.section._getMenuItems() ?? [];
        items.forEach(x => x._ext.name.toLowerCase().includes(search) ? x.show() : x.hide());
        this._menus?.sep.label.set_text(this._getTypeHints());
        focus.grab_key_focus(); // HACK: in case the focused item loses focus when hidden
    }

    _getTypeHints() {
        return this._search ? `${_('Typed')}: ${this._search}` : this._tooltip ? _('Type to search') : '';
    }

    _genToolbar() {
        let sep = new PopupMenu.PopupSeparatorMenuItem(this._getTypeHints()),
            style_class = 'extension-list-iconbtn',
            prefs = new IconItem({
                extbtn: [{style_class, visible: this.extbtn}, () => this._openExtensionApp(), Icon.ADN, this._tooltip && _('Open extensions app or website')],
                disbtn: [{style_class, visible: this.disbtn}, () => {
                    this.pin(); this._fulu.set('inactive', !this.inactive, this);
                }, [this.inactive, Icon.SHOW, Icon.HIDE], this._tooltip && [_('Show inactive extensions'), _('Hide inactive extensions')]],
                delbtn: [{style_class, visible: this.delbtn}, () => {
                    this.pin(); this._fulu.set('icon', this.icon === Icon.DEL ? 0 : 1, this);
                    this._menus.prefs.getIcon('urlbtn').setIcon(Icon.URL);
                }, [this.icon !== Icon.DEL, Icon.DEL, Icon.SET], this._tooltip && [_('Toggle delete button'), _('Toggle setting button')]],
                urlbtn: [{style_class, visible: this.urlbtn}, () => {
                    this.pin(); this._fulu.set('icon', this.icon === Icon.URL ? 0 : 2, this);
                    this._menus.prefs.getIcon('delbtn').setIcon(Icon.DEL);
                }, [this.icon !== Icon.URL, Icon.URL, Icon.SET], this._tooltip && [_('Toggle homepage button'), _('Toggle setting button')]],
                pinbtn: [{style_class, visible: this.pinbtn}, () => this._fulu.set('unpin', !this.unpin, this), Icon.PIN, this._tooltip && _('Toggle pin/normal menu')],
            });
        return {sep, prefs};
    }

    getExtensions() {
        let ret = Array.from(Main.extensionManager._extensions.values()).map(x => this.extract(x));
        if(!this.unpin) {
            if(this.inactive) ret = ret.filter(x => x.show && x.state === ExtensionState.ACTIVE);
            else ret = ret.filter(x => x.show);
        }
        return ret.sort((a, b) => a.name.localeCompare(b.name));
    }

    extract({uuid, state, type, hasPrefs, metadata: {name, url}, canChange}) {
        let show = !this.unpinned.has(uuid),
            orna = this.unpin ? true : !this.inactive,
            icon = this.unpin ? show ? Icon.UNPIN : Icon.PIN : this.icon;
        return {uuid, state, type, prefs: hasPrefs, name, url, show, icon, orna, mutable: canChange};
    }

    _openExtensionApp() {
        this.pin();
        this._btn.menu.close();
        if(this.extapp) Shell.AppSystem.get_default().lookup_app(this.extapp)?.activate();
        else open('https://extensions.gnome.org/local');
    }
}

export default class Extension extends ExtensionBase { $klass = ExtensionList; }
