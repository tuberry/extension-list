// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import {Icon} from './const.js';

const {_} = UI;

class ExtensionListPrefs extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super();
        this._buildWidgets(gset);
        this._buildUI();
    }

    _buildWidgets(gset) {
        this._blk = UI.block({
            APP: [new UI.App()],
            DEL: [new UI.Check()],
            DIS: [new UI.Check()],
            EXT: [new UI.Check()],
            PIN: [new UI.Check()],
            URL: [new UI.Check()],
            TIP: [new UI.Switch()],
        }, gset);
    }

    _buildUI() {
        let group = new Adw.PreferencesGroup(),
            mkIcon = icon_name => new Gtk.Image({icon_name}),
            toolbar = new Adw.PreferencesGroup({title: _('Toolbar'), header_suffix: new Gtk.Label({label: _('Icon')})});
        group.add(new UI.PrefRow([_('Enable tootip'), _('Show the tooltip for each toolbar button')], this._blk.TIP));
        [
            [this._blk.EXT, [_('Extension'), _('Open <i>extensions.gnome.org</i> or…')], this._blk.APP],
            [this._blk.DIS, [_('Inactive'), _('Hide/Show inactive extensions from menu')], mkIcon(Icon.SHOW)],
            [this._blk.DEL, [_('Delete'), _('Toggle delete buttons in menu items')], mkIcon(Icon.DEL)],
            [this._blk.URL, [_('URL'), _('Toggle url buttons in menu items')], mkIcon(Icon.URL)],
            [this._blk.PIN, [_('Pin'), _('Toggle menu to pin/unpin extensions')], mkIcon(Icon.PIN)],
        ].forEach(xs => toolbar.add(new UI.PrefRow(...xs)));
        [group, toolbar].forEach(x => this.add(x));
    }
}

export default class PrefsWidget extends UI.Prefs { $klass = ExtensionListPrefs; }
