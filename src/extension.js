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

import {Field, Icon} from './const.js';
import {IconButton, IconItem, MenuItem, Systray} from './menu.js';
import {Setting, Extension, Mortal, Source, view, connect, _, open} from './fubar.js';

const Button = {SET: 0, DEL: 1, URL: 2};
const Style = {[ExtensionState.ERROR]: 'state-error', [ExtensionState.OUT_OF_DATE]: 'state-outdate'};

class ExtensionItem extends MenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(ext) {
        super('', (...xs) => this.$onActivate(...xs), {can_focus: false});
        this.add_style_class_name('extension-list-item');
        this.label.set_x_expand(true);
        this.label.add_style_class_name('extension-list-label');
        this.label.clutterText.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this.$btn = new IconButton({styleClass: 'extension-list-icon'}, () => this.$onButtonClick());
        this.add_child(this.$btn);
        if(ext) this.setExtension(ext);
    }

    setExtension(ext) {
        this.ext = ext;
        this.label.set_can_focus(ext.mutable);
        let label = this.ext.type === ExtensionType.SYSTEM ? `${this.ext.name} *` : this.ext.name;
        this.setOrnament(this.ext.orna && this.ext.state === ExtensionState.ACTIVE ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.setLabel(label, Style[ext.state] ?? (ext.mutable ? undefined : 'state-immutable'));
        this.setIcon(this.ext.icon);
    }

    setLabel(label, state) {
        this.label.set_text(label);
        if(this.$state === state) return;
        if(this.$state) this.label.remove_style_pseudo_class(this.$state);
        if(state) this.label.add_style_pseudo_class(state);
        this.$state = state;
    }

    setIcon(icon) {
        if(this.icon === icon) return;
        view(this.$getIconVisible(this.icon = icon), this.$btn);
        if(this.$btn.visible) this.$btn.setIcon(icon);
    }

    $getIconVisible(icon) {
        switch(icon) {
        case Icon.SET: return this.ext.prefs;
        case Icon.URL: return !!this.ext.url;
        case Icon.DEL: return this.ext.type !== ExtensionType.SYSTEM;
        default: return true;
        }
    }

    $onButtonClick() {
        switch(this.icon) {
        case Icon.SET: this._getTopMenu().close(); Main.extensionManager.openExtensionPrefs(this.ext.uuid, '', {}); break;
        case Icon.DEL: this._getTopMenu().close(); uninstallExtension(this.ext.uuid); break;
        case Icon.URL: this._getTopMenu().close(); open(this.ext.url); break;
        default: this._getTopMenu().togglePin(this.ext.uuid); break;
        }
    }

    $onActivate(_a, event) {
        switch(this.icon) {
        case Icon.SET: case Icon.DEL: case Icon.URL:
            if(event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
                this.$onButtonClick();
            } else if(this.ext.mutable) {
                if(this.ext.state === ExtensionState.ACTIVE) Main.extensionManager.disableExtension(this.ext.uuid);
                else Main.extensionManager.enableExtension(this.ext.uuid);
            }
            break;
        default: this._getTopMenu().togglePin(this.ext.uuid, true); break;
        }
    }
}

class ExtensionSection extends PopupMenu.PopupMenuSection {
    constructor(list) {
        super();
        this.$buildWidgets();
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
        if(ext.state === ExtensionState.UNINSTALLED) return items.find(x => x.ext.uuid === ext.uuid)?.destroy();
        let index = items.findIndex(x => x.ext.name.localeCompare(ext.name) >= 0);
        if(items[index]?.ext.uuid === ext.uuid) items[index].setExtension(ext);
        else this.addMenuItem(new ExtensionItem(ext), index < 0 ? undefined : index);
    }

    $buildWidgets() {
        this.actor = new St.ScrollView({
            child: this.box,
            clipToAllocation: true,
            styleClass: 'extension-list-view',
        });
        this.actor._delegate = this;
    }
}

class ExtensionList extends Mortal {
    constructor(gset) {
        super();
        this.$bindSettings(gset);
        this.$buildWidgets();
        connect(this, Main.extensionManager, 'extension-state-changed', (...xs) => this.$onStateChange(...xs));
    }

    $buildWidgets() {
        this.search = '';
        this.$src = Source.fuse({tray: this.$genSystray()}, this);
    }

    $bindSettings(gset) {
        this.$set = new Setting({
            extApp: [Field.APP, 'string'],
        }, gset, this).attach({
            unpin:    [Field.TPN, 'boolean'],
            inactive: [Field.HDS, 'boolean'],
            unpinned: [Field.UPN, 'strv',    x => new Set(x)],
            tooltip:  [Field.TIP, 'boolean', null, x => this.$postTooltipSet(x)],
            icon:     [Field.BTN, 'uint',    x => [Icon.SET, Icon.DEL, Icon.URL][x]],
        }, this, () => this.$onSectionPut()).attach({
            extBtn: [Field.EXT, 'boolean'],
            urlBtn: [Field.URL, 'boolean'],
            disBtn: [Field.DIS, 'boolean'],
            delBtn: [Field.DEL, 'boolean'],
            pinBtn: [Field.PIN, 'boolean'],
        }, this, (v, k) => this.$menu?.prefs.viewIcon(k, v));
    }

    get $menu() {
        return this.$src?.tray.$menu;
    }

    $genSystray() {
        let btn = new Systray({section: new ExtensionSection(this.getExtensions()), ...this.$genToolbar()}, Icon.ADN);
        btn.menu.connect('menu-closed', () => this.$updateSearch(''));
        btn.menu.actor.connect('key-press-event', (...xs) => this.$onKeyPress(...xs));
        btn.menu.togglePin = (uuid, once) => {
            this.unpinned.has(uuid) ? this.unpinned.delete(uuid) : this.unpinned.add(uuid);
            this.$set.set('unpinned', [...this.unpinned], this);
            if(once) this.$set.set('unpin', false, this);
        };
        return btn;
    }

    $onSectionPut() {
        if(!this.$menu) return;
        this.$menu.section.setExtensions(this.getExtensions());
        this.$updateSearch('');
    }

    $postTooltipSet() {
        if(!this.$menu) return;
        Object.entries(this.$genToolbar()).forEach(([k, v]) => {
            this.$menu[k].destroy();
            this.$src.tray.menu.addMenuItem(this.$menu[k] = v);
        });
    }

    $onStateChange(_m, extension) {
        let ext = this.extract(extension);
        if(this.unpin) this.$menu.section.updateExtension(ext);
        else if(this.inactive) this.$menu.section.setExtensions(this.getExtensions());
        else if(ext.show) this.$menu.section.updateExtension(ext);
    }

    pin() {
        if(this.unpin) this.$set.set('unpin', false, this);
    }

    $onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(key > 32 && key < 127) this.$updateSearch(this.search + String.fromCharCode(key)); // printable ASCII
        else if(key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace) this.$updateSearch(this.search.slice(0, -1));
        return Clutter.EVENT_PROPAGATE;
    }

    // NOTE: just use ASCIIs instead of Unicodes(StEntry) to search since [1], [2] and [3]
    // [1] search with IME issue: https://gitlab.gnome.org/GNOME/gtk/-/issues/2636
    // [2] extension metadata L10N issue: https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/2288
    // [3] PopupMenus cover IBusPopup: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2331
    $updateSearch(search) {
        if(this.search === search) return;
        this.search = search;
        let focus = global.stage.get_key_focus();
        let items = this.$menu.section._getMenuItems() ?? [];
        items.forEach(x => x.ext.name.toLowerCase().includes(search) ? x.show() : x.hide());
        this.$menu.sep.label.set_text(this.$getTypeHints());
        focus.grab_key_focus(); // HACK: in case the focused item loses focus when hidden
    }

    $getTypeHints() {
        return this.search ? `${_('Typed')}: ${this.search}` : this.tooltip ? _('Type to search') : '';
    }

    $genToolbar() {
        let tip = this.tooltip,
            sep = new PopupMenu.PopupSeparatorMenuItem(this.$getTypeHints(tip)),
            styleClass = 'extension-list-icon',
            prefs = new IconItem({
                extBtn: [{styleClass, visible: this.extBtn}, () => this.openExtensionApp(), Icon.ADN, tip && _('Open extensions app or website')],
                disBtn: [{styleClass, visible: this.disBtn}, () => {
                    this.pin(); this.$set.set('inactive', !this.inactive, this);
                }, [this.inactive, Icon.SHOW, Icon.HIDE], tip && [_('Show inactive extensions'), _('Hide inactive extensions')]],
                delBtn: [{styleClass, visible: this.delBtn}, () => {
                    this.pin(); this.$set.set('icon', this.icon === Icon.DEL ? Button.SET : Button.DEL, this);
                    this.$menu.prefs.getIcon('urlBtn').setIcon(Icon.URL);
                }, [this.icon !== Icon.DEL, Icon.DEL, Icon.SET], tip && [_('Toggle delete button'), _('Toggle setting button')]],
                urlBtn: [{styleClass, visible: this.urlBtn}, () => {
                    this.pin(); this.$set.set('icon', this.icon === Icon.URL ? Button.SET : Button.URL, this);
                    this.$menu.prefs.getIcon('delBtn').setIcon(Icon.DEL);
                }, [this.icon !== Icon.URL, Icon.URL, Icon.SET], tip && [_('Toggle homepage button'), _('Toggle setting button')]],
                pinBtn: [{styleClass, visible: this.pinBtn}, () => this.$set.set('unpin', !this.unpin, this),
                    Icon.PIN, tip && _('Toggle pin/normal menu')],
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

    openExtensionApp() {
        this.pin();
        this.$src.tray.menu.close();
        if(this.extApp) Shell.AppSystem.get_default().lookup_app(this.extApp)?.activate();
        else open('https://extensions.gnome.org/local');
    }
}

export default class MyExtension extends Extension { $klass = ExtensionList; }
