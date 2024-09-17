// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import {Icon, EGO} from './const.js';

const {_} = UI;

class ExtensionListPrefs extends UI.PrefsPage {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super();
        this.#buildWidgets(gset);
        this.#buildUI();
    }

    #buildWidgets(gset) {
        this.$blk = UI.tie({
            APP: new UI.App(),
            DEL: new UI.Check(),
            FLT: new UI.Check(),
            EXT: new UI.Check(),
            IGN: new UI.Check(),
            URL: new UI.Check(),
            TIP: new UI.Switch(),
        }, gset);
    }

    #genMenuHelp() {
        let name = 'Lorem Ipsum',
            fill = '<tt>  </tt>',
            wrap = x => `${fill}<span fgcolor="${x}">${name}</span>${fill}\t`;
        return new UI.Help(`<b>${_('Extension state illustration')}</b>
<tt>\u2713 </tt>${name}${fill}\t${_('active')}
${fill}${name}${fill}\t${_('inactive')}
${fill}${name}<tt> *</tt>\t${_('system')}
${wrap('dimgrey')}${_('ignored')}
${wrap('green')}${_('update')}
${wrap('orange')}${_('outdated')}
${wrap('red')}${_('error')}
${_(`<b>Menu</b>
press Alt + number key n to trigger the nth toolbar button
<b>Menu item</b>
left/middle click to activate/deactivate the extension
right click or press Ctrl key to trigger the tail button`)}`, {selectable: false});
    }

    #buildUI() {
        this.addToGroup(new UI.ActRow([_('Enable _tooltip'), _('Show the tooltip for each toolbar button')], this.#genMenuHelp(), this.$blk.TIP));
        let genIcon = iconName => new Gtk.Image({iconName});
        let toolbar = new Adw.PreferencesGroup({title: _('Toolbar'), headerSuffix: new Gtk.Label({label: _('Icon')})});
        [
            [this.$blk.EXT, [_('_Extension'), _('Open extension <a href="%s">website</a> or app').format(EGO)], this.$blk.APP],
            [this.$blk.FLT, [_('_Filter'), _('Show/Hide ignored extensions, same as pressing left Shift key')], genIcon(Icon.ALL)],
            [this.$blk.DEL, [_('_Remove'), _('Toggle remove buttons in menu items')], genIcon(Icon.DEL)],
            [this.$blk.URL, [_('_Homepage'), _('Toggle homepage buttons in menu items')], genIcon(Icon.URL)],
            [this.$blk.IGN, [_('_Ignore'), _('Toggle ignore/normal menu, same as pressing right Shift key')], genIcon(Icon.SHOW)],
        ].forEach(xs => toolbar.add(new UI.ActRow(...xs)));
        this.add(toolbar);
    }
}

export default class Prefs extends UI.Prefs { $klass = ExtensionListPrefs; }
