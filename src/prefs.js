// vim:fdm=syntax
// by tuberry

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import { Icon } from './const.js';

const { _ } = UI;

class ExtensionListPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super({ title: _('Toolbar'), header_suffix: new Gtk.Label({ label: _('Icon') }) });
        this._buildWidgets(gset);
        this._buildUI();
    }

    _buildWidgets(gset) {
        this._blk = UI.block({
            APP: ['value',  new UI.App()],
            DEL: ['active', new Gtk.CheckButton()],
            DIS: ['active', new Gtk.CheckButton()],
            EXT: ['active', new Gtk.CheckButton()],
            PIN: ['active', new Gtk.CheckButton()],
            URL: ['active', new Gtk.CheckButton()],
        }, gset);
    }

    _buildUI() {
        let image = icon_name => new Gtk.Image({ icon_name });
        [
            [this._blk.EXT, [_('Extension'), _('Open <i>extensions.gnome.org</i> or…')], this._blk.APP],
            [this._blk.DIS, [_('Disabled'), _('Hide/Unhide disabled extensions from menu')], image(Icon.SHOW)],
            [this._blk.DEL, [_('Delete'), _('Toggle delete button from menu items')], image(Icon.DEL)],
            [this._blk.URL, [_('URL'), _('Toggle url button from menu items')], image(Icon.URL)],
            [this._blk.PIN, [_('Pin'), _('Toggle menu for pin/unpin extensions')], image(Icon.PIN)],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}

export default class PrefsWidget extends UI.Prefs { $klass = ExtensionListPrefs; }
