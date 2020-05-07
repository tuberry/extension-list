// vim:fdm=syntax
// by tuberry
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const gsettings = ExtensionUtils.getSettings();

var Fields = {
    INDICATOR:  'indicator-text',
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
        this._field_indicator = this._entryMaker('Exts', _('Unicode is acceptable, eg: \\uf123.'));
    }

    _bulidUI() {
        this._row = 0;
        this._rowMaker(this._labelMaker(_('Indicator text')), this._field_indicator);
    }

    _bindValues() {
        gsettings.bind(Fields.INDICATOR, this._field_indicator, 'text', Gio.SettingsBindFlags.DEFAULT);
    }

    _rowMaker(x, y, z) {
        let hbox = new Gtk.HBox({ hexpand: true });
        if(z) {
            hbox.pack_start(x, false, false, 10);
            hbox.pack_start(y, true, true, 10);
            hbox.pack_end(z, false, false, 10);
        } else if(y) {
            hbox.pack_start(x, true, true, 10);
            hbox.pack_start(y, false, false, 10);
        } else {
            hbox.pack_start(x, true, true, 10);
        }
        this.attach(hbox, 0, this._row++, 1, 1);
    }

    _entryMaker(x, y) {
        return new Gtk.Entry({
            placeholder_text: x,
            secondary_icon_sensitive: true,
            secondary_icon_tooltip_text: y,
            secondary_icon_activatable: true,
            secondary_icon_name: "dialog-information-symbolic",
        });
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


