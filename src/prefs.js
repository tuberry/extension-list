// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Gtk from 'gi://Gtk';

import * as UI from './ui.js';
import * as T from './util.js';
import {Icon, Key as K, EGO} from './const.js';

const {_} = UI;

class ExtensionListPrefs extends UI.Page {
    static {
        T.enrol(this);
    }

    $buildWidgets() {
        return [
            [K.APP, new UI.App()],
            [K.DEL, new UI.Check()],
            [K.FLT, new UI.Check()],
            [K.EXT, new UI.Check()],
            [K.IGN, new UI.Check()],
            [K.URL, new UI.Check()],
            [K.TIP, new UI.Switch()],
        ];
    }

    $buildUI() {
        let img = x => new Gtk.Image({iconName: x});
        this.$add([null, [
            [[_('Enable _tooltip'), _('Show the tooltip for each toolbar button')],
                new UI.Help(({m, k, h}) => [h(_('Extension state illustration')), [
                    [_('active'), '', '\u{2713}'],
                    [_('inactive')],
                    [_('system'), '', '', '*'],
                    [_('ignored'), 'dimmed'],
                    [_('update'), 'success'],
                    [_('outdated'), 'warning'],
                    [_('error'), 'error'],
                ].map(([x, y, u, v]) => [u, m('Lorem Ipsum', y), v, x]), h(_('Menu shortcuts')), [
                    [_('trigger the toolbar button'), k('<alt>1 2 3')],
                ], h(_('Menu item shortcuts')), [
                    [_('toggle the extension'), k('space Return'), _('primary/middle click')],
                    [_('trigger the tail button'),  k('Control_L'), _('secondary click')],
                ]]), K.TIP],
        ]], [[[_('Toolbar')], new Gtk.Label({label: _('Icon')})], [
            [K.EXT, [_('_Extension'), _('Open extension <a href="%s">website</a> or app').format(EGO)], K.APP],
            [K.FLT, [_('_Filter'), _('Show/Hide ignored extensions, as pressing right Shift key')], img(Icon.ALL)],
            [K.DEL, [_('_Remove'), _('Toggle remove buttons in menu items')], img(Icon.DEL)],
            [K.URL, [_('_Homepage'), _('Toggle homepage buttons in menu items')], img(Icon.URL)],
            [K.IGN, [_('_Ignore'), _('Toggle ignore/normal menu, as pressing right Ctrl key')], img(Icon.SHOW)],
        ]]);
    }
}

export default class extends UI.Prefs { $klass = ExtensionListPrefs; }
