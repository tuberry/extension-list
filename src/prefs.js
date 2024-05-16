// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import {Icon} from './const.js';

const {_} = UI;

class ExtensionListPrefs extends UI.PrefPage {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super();
        this.$buildWidgets(gset);
        this.$buildUI();
    }

    $buildWidgets(gset) {
        this.$blk = UI.block({
            APP: new UI.App(),
            DEL: new UI.Check(),
            DIS: new UI.Check(),
            EXT: new UI.Check(),
            PIN: new UI.Check(),
            URL: new UI.Check(),
            TIP: new UI.Switch(),
        }, gset);
    }

    $buildUI() {
        this.addToGroup(new UI.PrefRow([_('Enable tootip'), _('Show the tooltip for each toolbar button')], this.$blk.TIP));
        let genIcon = iconName => new Gtk.Image({iconName});
        let toolbar = new Adw.PreferencesGroup({title: _('Toolbar'), headerSuffix: new Gtk.Label({label: _('Icon')})});
        [
            [this.$blk.EXT, [_('Extension'), _('Open <i>extensions.gnome.org</i> or…')], this.$blk.APP],
            [this.$blk.DIS, [_('Inactive'), _('Hide/Show inactive extensions from menu')], genIcon(Icon.SHOW)],
            [this.$blk.DEL, [_('Delete'), _('Toggle delete buttons in menu items')], genIcon(Icon.DEL)],
            [this.$blk.URL, [_('URL'), _('Toggle url buttons in menu items')], genIcon(Icon.URL)],
            [this.$blk.PIN, [_('Pin'), _('Toggle menu to pin/unpin extensions')], genIcon(Icon.PIN)],
        ].forEach(xs => toolbar.add(new UI.PrefRow(...xs)));
        this.add(toolbar);
    }
}

export default class PrefsWidget extends UI.Prefs { $klass = ExtensionListPrefs; }
