// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Icon } = Me.imports.const;
const { _ } = Me.imports.util;
const UI = Me.imports.ui;

function buildPrefsWidget() {
    return new ExtensionListPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

class ExtensionListPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({ title: _('Toolbar'), header_suffix: new Gtk.Label({ label: _('Icon') }) });
        this._buildWidgets();
        this._buildUI();
    }

    _buildWidgets() {
        this._blk = UI.block({
            APP: ['value',  new UI.App()],
            DEL: ['active', new Gtk.CheckButton()],
            DIS: ['active', new Gtk.CheckButton()],
            EXT: ['active', new Gtk.CheckButton()],
            PIN: ['active', new Gtk.CheckButton()],
            URL: ['active', new Gtk.CheckButton()],
        });
    }

    _buildUI() {
        let image = icon_name => new Gtk.Image({ icon_name });
        [
            [this._blk.EXT, [_('Extension'), _('Open <i>extensions.gnome.org</i> or…')], this._blk.APP],
            [this._blk.DIS, [_('Disabled'), _('Hide/Unhide disabled extensions from menu')], image(Icon.COOL)],
            [this._blk.DEL, [_('Delete'), _('Toggle delete button from menu items')], image(Icon.DEL)],
            [this._blk.URL, [_('URL'), _('Toggle url button from menu items')], image(Icon.URL)],
            [this._blk.PIN, [_('Pin'), _('Toggle menu for pin/unpin extensions')], image(Icon.SHOW)],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}
