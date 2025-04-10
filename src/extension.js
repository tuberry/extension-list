// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as ExtensionDownloader from 'resource:///org/gnome/shell/ui/extensionDownloader.js';
import {ExtensionType as Type, ExtensionState as State} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import * as T from './util.js';
import * as M from './menu.js';
import * as F from './fubar.js';

import {Key as K, Icon, EGO} from './const.js';

const {_} = F;

const Tail = {SET: 0, DEL: 1, URL: 2};
const Show = {true: Icon.HIDE, false: Icon.SHOW};
const Style = {[State.ERROR]: 'state-error', [State.OUT_OF_DATE]: 'state-outdated'};

class ExtensionItem extends M.DatumItemBase {
    static {
        T.enrol(this);
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
        let label = type === Type.SYSTEM ? `${name} *` : name;
        this.setOrnament(state === State.ACTIVE ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.#setLabel(label, Style[state] ?? (update ? 'state-update' : show ? undefined : 'state-ignored'));
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
        case Icon.DEL: visible = meta.type !== Type.SYSTEM; break;
        }
        if(this.$btn.has_key_focus() && !visible) this.label.grab_key_focus(); // HACK: avoid loss of focus while hiding
        F.view(visible, this.$btn);
        this.$btn.setup(icon);
    }

    #onKeyFocusIn() {
        AnimationUtils.ensureActorVisibleInScrollView(this._parent.actor, this);
    }

    $onClick(meta = this.$meta) { // NOTE: stash for consistency/immutability
        switch(meta.icon) {
        case Icon.SET: this._getTopMenu().close(); Main.extensionManager.openExtensionPrefs(meta.uuid, '', {}); break;
        case Icon.DEL: this._getTopMenu().close(); ExtensionDownloader.uninstallExtension(meta.uuid); break;
        case Icon.URL: this._getTopMenu().close(); F.open(meta.url); break;
        default: this.$onIgnoreToggle(meta); break;
        }
    }

    $onActivate(meta = this.$meta) {
        switch(meta.icon) {
        case Icon.SET: case Icon.DEL: case Icon.URL:
            if(meta.state === State.ACTIVE) Main.extensionManager.disableExtension(meta.uuid);
            else Main.extensionManager.enableExtension(meta.uuid);
            break;
        default: this.$onIgnoreToggle(meta); break;
        }
    }
}

class ExtensionSection extends M.DatasetSection {
    constructor(...args) {
        super(...args);
        this.actor = new St.ScrollView({child: this.box, clipToAllocation: true, styleClass: 'extension-list-view'});
        this.actor._delegate = this;
    }

    upsert(meta) {
        let items = this._getMenuItems();
        if(meta.state === State.UNINSTALLED) return items.find(x => x.$meta.uuid === meta.uuid)?.destroy();
        let index = items.findIndex(x => x.$meta.name.localeCompare(meta.name) >= 0);
        if(items[index]?.$meta.uuid === meta.uuid) items[index].setup(meta);
        else this.addMenuItem(this.$genItem(meta), index < 0 ? undefined : index);
    }
}

class ExtensionList extends F.Mortal {
    constructor(gset) {
        super();
        this.#bindSettings(gset);
        this.#buildWidgets();
    }

    #buildWidgets() {
        this.$typed = '';
        this.$src = F.Source.tie({
            tray: new M.Systray({
                ext: new ExtensionSection(x => new ExtensionItem(x, y => {
                    this[K.IGL].has(y) ? this[K.IGL].delete(y) : this[K.IGL].add(y);
                    this.$set.set(K.IGL, [...this[K.IGL]]);
                }), this.getExtensions()),
                sep: new M.Separator(),
                bar: (t => t.length ? new M.ToolItem(t) : null)(this.#genTool()),
            }, Icon.ADN),
        }, this);
        this.$src.tray.menu.connect('menu-closed', () => this.#onMenuClose());
        this.$src.tray.menu.actor.connect('key-press-event', (...xs) => this.#onKeyPress(...xs));
        F.connect(this, Main.extensionManager, 'extension-state-changed', (...xs) => this.#onStateChange(...xs));
    }

    get menu() {
        return this.$src.tray.$menu;
    }

    #bindSettings(gset) {
        this.$set = new F.Setting(gset, [
            K.APP, [K.IGL, x => new Set(x), null, false],
            [K.TIP, null, x => { this.menu.bar?.setup(this.#genTool()); this.#updateHint(x); }],
        ], this).tie([
            K.EXT, K.URL, K.DEL, K.IGN, K.FLT,
        ], this, null, () => this.#onToolbarSet()).tie([
            [K.IGM, null, x => this.menu.bar?.[K.IGN]?.toggleState(x)],
            [K.FLR, null, x => this.menu.bar?.[K.FLT]?.toggleState(x)],
            [K.BTN, x => [Icon.SET, Icon.DEL, Icon.URL][x], x => this.#onTailIconSet(x)],
        ], this, null, (_v, f) => this.#onMenuChange(f === K.IGM));
    }

    #onToolbarSet() {
        let tool = this.#genTool();
        if(T.xnor(tool.length, this.menu.bar)) this.menu.bar?.setup(tool);
        else M.record(tool.length, this.$src.tray, () => new M.ToolItem(tool), 'bar', null);
    }

    #onMenuChange(ignoring) {
        if(!ignoring && this[K.IGM]) this.$set.set(K.IGM, false);
        this.menu.ext.setup(this.getExtensions());
        this.#refind(ignoring ? '' : this.$typed);
    }

    #onTailIconSet(icon) {
        this.menu.bar?.[K.URL]?.toggleState(icon !== Icon.URL);
        this.menu.bar?.[K.DEL]?.toggleState(icon !== Icon.DEL);
    }

    #onStateChange(_m, extension) {
        let ext = this.extract(extension);
        if(this[K.FLR] && !ext.show && !this[K.IGM]) return;
        this.menu.ext.upsert(ext);
    }

    #onMenuClose() {
        this.#refind();
        this[K.FLR] || this.$set.set(K.FLR, true);
        this[K.IGM] && this.$set.set(K.IGM, false);
    }

    #onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(M.altNum(key, event, this.menu.bar ?? [])) return;
        if(key >= Clutter.KEY_exclam && key <= Clutter.KEY_asciitilde) return this.#search(this.$typed + String.fromCodePoint(key));
        switch(key) {
        case Clutter.KEY_Shift_R: this.$set.not(K.FLR); break;
        case Clutter.KEY_Control_R: this.$set.not(K.IGM); break;
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
        if(text) this.#match.some(f => (best = items.filter(x => T.seq(y => F.view(y, x), f(x.$meta.text, text)))[0]?.label));
        else F.view(true, ...items);
        (best ?? this.$src.tray.menu.actor).grab_key_focus();
    }

    #match = [(x, y) => x.startsWith(y), (x, y) => x.includes(y), (x, y) => T.search(y, x)];

    #refind(text = '') {
        if(this.$typed) this.#search(text);
    }

    #updateHint() {
        this.menu.sep.label.set_text(this.$typed ? `${_('Typed')}: ${this.$typed}` : this[K.TIP] ? _('Type to search') : '');
        if(!this.menu.bar) F.view(this.$typed, this.menu.sep);
    }

    #genTool() {
        return [
            [K.EXT, [() => this.openExtensionApp(), Icon.ADN, _('Open extensions website or app')]],
            [K.FLT, [() => this.$set.not(K.FLR), [this[K.FLR], Icon.ALL, Icon.IGN], [_('Show all extensions'), _('Hide ignored extensions')]]],
            [K.DEL, [() => this.$set.set(K.BTN, this[K.BTN] === Icon.DEL ? Tail.SET : Tail.DEL),
                [this[K.BTN] !== Icon.DEL, Icon.DEL, Icon.SET], [_('Toggle remove button'), _('Toggle setting button')]]],
            [K.URL, [() => this.$set.set(K.BTN, this[K.BTN] === Icon.URL ? Tail.SET : Tail.URL),
                [this[K.BTN] !== Icon.URL, Icon.URL, Icon.SET], [_('Toggle homepage button'), _('Toggle setting button')]]],
            [K.IGN, [() => this.$set.not(K.IGM), [this[K.IGM], Icon.HIDE, Icon.SHOW], [_('Toggle normal menu'), _('Toggle ignore menu')]]],
        ].flatMap(([k, [f, c, t]]) => this[k] ? [[k, new (T.str(t) ? M.Button
            : M.StateButton)({styleClass: 'extension-list-icon', xExpand: true}, f, c, this[K.TIP] && t)]] : []);
    }

    getExtensions() {
        let exts = Array.from(Main.extensionManager._extensions.values()).map(x => this.extract(x)); // TODO: Iter
        if(!this[K.IGM] && this[K.FLR]) exts = exts.filter(x => x.show);
        return exts.toSorted((a, b) => a.name.localeCompare(b.name));
    }

    extract({uuid, state, type, hasPrefs: prefs, hasUpdate: update, metadata: {name, url}}) {
        let show = !this[K.IGL].has(uuid);
        let icon = this[K.IGM] ? Show[show] : this[K.BTN];
        return {uuid, state, type, prefs, update, name, text: name.toLowerCase(), url, show, icon};
    }

    openExtensionApp() {
        this.$src.tray.menu.close();
        if(this[K.APP]) Shell.AppSystem.get_default().lookup_app(this[K.APP])?.activate();
        else F.open(EGO);
    }
}

export default class extends F.Extension { $klass = ExtensionList; }
