// vim:fdm=syntax
// by tuberry
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const gsettings = ExtensionUtils.getSettings();

var Fields = {
    URL:    'url-button',
    PREFS:  'prefs-button',
    DELETE: 'delete-button',
};

const ExtensionList = GObject.registerClass(
class ExtensionList extends Gtk.Grid {
    _init() {
        super._init({
            margin: 10,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this.show_all();
    }

    _bulidWidget() {
        this._field_url    = new Gtk.Switch({ active: gsettings.get_boolean(Fields.URL) });
        this._field_prefs  = new Gtk.Switch({ active: gsettings.get_boolean(Fields.PREFS) });
        this._field_delete = new Gtk.Switch({ active: gsettings.get_boolean(Fields.DELETE) });
    }

    _bulidUI() {
        this._row = 0;
        this._rowMaker(this._labelMaker(_('Prefs button')), this._field_prefs);
        this._rowMaker(this._labelMaker(_('URL button')), this._field_url);
        this._rowMaker(this._labelMaker(_('Delete button')), this._field_delete);
    }

    _bindValues() {
        gsettings.bind(Fields.URL,    this._field_url,    'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.PREFS,  this._field_prefs,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.DELETE, this._field_delete, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _rowMaker(x, y) {
        let hbox = new Gtk.HBox({ hexpand: true });
        hbox.pack_start(x, true, true, 10);
        hbox.pack_start(y, false, false, 10);
        this.attach(hbox, 0, this._row++, 1, 1);
    }

    _labelMaker(x) {
        return new Gtk.Label({
            label: x,
            hexpand: true,
            use_markup: true,
            halign: Gtk.Align.START,
        });
    }
});

function buildPrefsWidget() {
    return new ExtensionList();
}

function init() {
    ExtensionUtils.initTranslations();
}


