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
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';

import * as Util from './util.js';
import * as Menu from './menu.js';
import * as Fubar from './fubar.js';
import {Field, Icon, EGO} from './const.js';

const {_} = Fubar;

const Tail = {SET: 0, DEL: 1, URL: 2};
const Show = {true: Icon.HIDE, false: Icon.SHOW};
const State = {[ExtensionState.ERROR]: 'state-error', [ExtensionState.OUT_OF_DATE]: 'state-outdated'};

class ExtensionItem extends Menu.DatumItemBase {
    static {
        GObject.registerClass(this);
    }

    constructor(ext, ignore) {
        super('extension-list-label', 'extension-list-icon', null, ext);
        this.add_style_class_name('extension-list-item');
        this.$btn.connect('key-focus-in', () => this.#onKeyFocusIn());
        this.label.connect('key-focus-in', () => this.#onKeyFocusIn());
        this.label.clutterText.set_ellipsize(Pango.EllipsizeMode.MIDDLE);
        this.$onIgnoreToggle = meta => {
            meta.icon = Show[meta.show = !meta.show];
            this.setup(meta);
            ignore(meta.uuid);
        };
    }

    setup(meta) {
        this.$meta = meta;
        let {type, state, update, name, icon, show} = meta;
        let label = type === ExtensionType.SYSTEM ? `${name} *` : name;
        this.setOrnament(state === ExtensionState.ACTIVE ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.#setLabel(label, State[state] ?? (update ? 'state-update' : show ? undefined : 'state-ignored'));
        this.#setButton(icon, meta);
    }

    #setLabel(label, state) {
        this.label.set_text(label);
        if(this.$state === state) return;
        if(this.$state) this.label.remove_style_pseudo_class(this.$state);
        if((this.$state = state)) this.label.add_style_pseudo_class(state);
    }

    #setButton(icon, meta) {
        let visible = true;
        switch(icon) {
        case Icon.SET: visible = meta.prefs; break;
        case Icon.URL: visible = meta.url; break;
        case Icon.DEL: visible = meta.type !== ExtensionType.SYSTEM; break;
        }
        if(this.$btn.has_key_focus() && !visible) this.label.grab_key_focus(); // HACK: avoid loss of focus while hiding
        Fubar.view(visible, this.$btn);
        this.$btn.setup(icon);
    }

    #onKeyFocusIn() {
        ensureActorVisibleInScrollView(this._parent.actor, this);
    }

    $onClick(meta = this.$meta) { // NOTE: staging for consistency/immutability
        switch(meta.icon) {
        case Icon.SET: this._getTopMenu().close(); Main.extensionManager.openExtensionPrefs(meta.uuid, '', {}); break;
        case Icon.DEL: this._getTopMenu().close(); uninstallExtension(meta.uuid); break;
        case Icon.URL: this._getTopMenu().close(); Fubar.open(meta.url); break;
        default: this.$onIgnoreToggle(meta); break;
        }
    }

    $onActivate(meta = this.$meta) {
        switch(meta.icon) {
        case Icon.SET: case Icon.DEL: case Icon.URL:
            if(meta.state === ExtensionState.ACTIVE) Main.extensionManager.disableExtension(meta.uuid);
            else Main.extensionManager.enableExtension(meta.uuid);
            break;
        default: this.$onIgnoreToggle(meta); break;
        }
    }
}

class ExtensionSection extends Menu.DatasetSection {
    constructor(...args) {
        super(...args);
        this.actor = new St.ScrollView({child: this.box, clipToAllocation: true, styleClass: 'extension-list-view'});
        this.actor._delegate = this;
    }

    upsert(meta) {
        let items = this._getMenuItems();
        if(meta.state === ExtensionState.UNINSTALLED) return items.find(x => x.$meta.uuid === meta.uuid)?.destroy();
        let index = items.findIndex(x => x.$meta.name.localeCompare(meta.name) >= 0);
        if(items[index]?.$meta.uuid === meta.uuid) items[index].setup(meta);
        else this.addMenuItem(this.$genItem(meta), index < 0 ? undefined : index);
    }
}

class ExtensionList extends Fubar.Mortal {
    constructor(gset) {
        super();
        this.#bindSettings(gset);
        this.#buildWidgets();
    }

    #buildWidgets() {
        this.$typed = '';
        this.$src = Fubar.Source.tie({
            tray: new Menu.Systray({
                ext: new ExtensionSection(x => new ExtensionItem(x, y => {
                    this.ignored.has(y) ? this.ignored.delete(y) : this.ignored.add(y);
                    this.$set.set('ignored', [...this.ignored], this);
                }), this.getExtensions()),
                sep: new PopupMenu.PopupSeparatorMenuItem(),
                bar: (t => t.length ? new Menu.ToolItem(t) : null)(this.#genTool()),
            }, Icon.ADN),
        }, this);
        this.$src.tray.menu.connect('menu-closed', () => this.#onMenuClose());
        this.$src.tray.menu.actor.connect('key-press-event', (...xs) => this.#onKeyPress(...xs));
        Fubar.connect(this, Main.extensionManager, 'extension-state-changed', (...xs) => this.#onStateChange(...xs));
    }

    get menu() {
        return this.$src.tray.$menu;
    }

    #bindSettings(gset) {
        this.$set = new Fubar.Setting(gset, {
            appid:   [Field.APP, 'string'],
            ignored: [Field.IGL, 'strv', x => new Set(x), null, false],
            tooltip: [Field.TIP, 'boolean', null, x => { this.menu.bar?.setup(this.#genTool()); this.#updateHint(x); }],
        }, this).attach({
            extApp: [Field.EXT, 'boolean'],
            extWeb: [Field.URL, 'boolean'],
            remove: [Field.DEL, 'boolean'],
            ignore: [Field.IGN, 'boolean'],
            filter: [Field.FLT, 'boolean'],
        }, this, null, () => this.#onToolbarSet()).attach({
            ignoring: [Field.IGM, 'boolean', null, x => this.menu.bar?.ignore?.toggleState(x)],
            filtered: [Field.FLR, 'boolean', null, x => this.menu.bar?.filter?.toggleState(x)],
            tailIcon: [Field.BTN, 'uint',    x => [Icon.SET, Icon.DEL, Icon.URL][x], x => this.#onTailIconSet(x)],
        }, this, null, (_v, k) => this.#onMenuChange(k === 'ignoring'));
    }

    #onToolbarSet() {
        let tool = this.#genTool();
        if(Util.xnor(tool.length, this.menu.bar)) this.menu.bar?.setup(tool);
        else Menu.record(tool.length, this.$src.tray, () => new Menu.ToolItem(tool), 'bar', null);
    }

    #onMenuChange(ignoring) {
        if(!ignoring) this.#noIgnoring();
        this.menu.ext.setup(this.getExtensions());
        this.#refind(ignoring ? '' : this.$typed);
    }

    #noIgnoring() {
        if(this.ignoring) this.$set.set('ignoring', false, this);
    }

    #onTailIconSet(icon) {
        this.menu.bar?.extWeb?.toggleState(icon !== Icon.URL);
        this.menu.bar?.remove?.toggleState(icon !== Icon.DEL);
    }

    #onStateChange(_m, extension) {
        let ext = this.extract(extension);
        if(this.filtered && !ext.show && !this.ignoring) return;
        this.menu.ext.upsert(ext);
    }

    #onMenuClose() {
        this.#refind();
        this.filtered || this.$set.set('filtered', true, this);
        this.#noIgnoring();
    }

    #onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(Menu.altNum(key, event, this.menu.bar ?? [])) return;
        if(key > 32 && key < 127) return this.#search(this.$typed + String.fromCharCode(key)); // printable ASCII
        switch(key) {
        case Clutter.KEY_Shift_L: this.$set.negate('filtered', this); break;
        case Clutter.KEY_Shift_R: this.$set.negate('ignoring', this); break;
        case Clutter.KEY_BackSpace: this.#refind(this.$typed.slice(0, -1)); break;
        case Clutter.KEY_Delete: this.#refind(); break;
        }
    }

    // NOTE: just use ASCIIs instead of Unicodes(StEntry) to search since [1], [2] and [3]
    // [1] search with IME issue: https://gitlab.gnome.org/GNOME/gtk/-/issues/2636
    // [2] extension metadata L10N issue: https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/2288
    // [3] PopupMenus cover IBusPopup: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2331
    #search(text) {
        this.$typed = text;
        this.#updateHint();
        let items = this.menu.ext._getMenuItems() ?? [], best;
        if(text) this.#match.some(f => (best = items.filter(x => Util.seq(y => Fubar.view(y, x), f(x.$meta.text, text)))[0]?.label));
        else Fubar.view(true, ...items);
        (best ?? this.$src.tray.menu.actor).grab_key_focus();
    }

    #match = [(x, y) => x.startsWith(y), (x, y) => x.includes(y), (x, y) => Util.search(y, x)];

    #refind(text = '') {
        if(this.$typed) this.#search(text);
    }

    #updateHint() {
        this.menu.sep.label.set_text(this.$typed ? `${_('Typed')}: ${this.$typed}` : this.tooltip ? _('Type to search') : '');
        if(!this.menu.bar) Fubar.view(this.$typed, this.menu.sep);
    }

    #genTool() {
        return Object.entries({
            extApp: [() => this.openExtensionApp(), Icon.ADN, _('Open extensions website or app')],
            filter: [() => this.$set.negate('filtered', this), [this.filtered, Icon.ALL, Icon.IGN], [_('Show all extensions'), _('Hide ignored extensions')]],
            remove: [() => this.$set.set('tailIcon', this.tailIcon === Icon.DEL ? Tail.SET : Tail.DEL, this),
                [this.tailIcon !== Icon.DEL, Icon.DEL, Icon.SET], [_('Toggle remove button'), _('Toggle setting button')]],
            extWeb: [() => this.$set.set('tailIcon', this.tailIcon === Icon.URL ? Tail.SET : Tail.URL, this),
                [this.tailIcon !== Icon.URL, Icon.URL, Icon.SET], [_('Toggle homepage button'), _('Toggle setting button')]],
            ignore: [() => this.$set.negate('ignoring', this), [this.ignoring, Icon.HIDE, Icon.SHOW], [_('Toggle normal menu'), _('Toggle ignore menu')]],
        }).flatMap(([k, [f, c, t]]) => this[k] ? [[k, new (Util.str(t) ? Menu.Button
            : Menu.StateButton)({styleClass: 'extension-list-icon', xExpand: true}, f, c, this.tooltip && t)]] : []);
    }

    getExtensions() {
        let exts = Array.from(Main.extensionManager._extensions.values()).map(x => this.extract(x));
        if(!this.ignoring && this.filtered) exts = exts.filter(x => x.show);
        return exts.toSorted((a, b) => a.name.localeCompare(b.name));
    }

    extract({uuid, state, type, hasPrefs: prefs, hasUpdate: update, metadata: {name, url}}) {
        let show = !this.ignored.has(uuid),
            icon = this.ignoring ? Show[show] : this.tailIcon;
        return {uuid, state, type, prefs, update, name, text: name.toLowerCase(), url, show, icon};
    }

    openExtensionApp() {
        this.$src.tray.menu.close();
        if(this.appid) Shell.AppSystem.get_default().lookup_app(this.appid)?.activate();
        else Fubar.open(EGO);
    }
}

export default class Extension extends Fubar.Extension { $klass = ExtensionList; }
