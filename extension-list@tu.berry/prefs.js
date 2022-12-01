// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, Gdk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Fields, Block, Icons } = Me.imports.fields;
const UI = Me.imports.ui;

const _ = ExtensionUtils.gettext;
const genIcon = icon_name => new Gtk.Image({ icon_name });
const genParam = (type, name, ...dflt) => GObject.ParamSpec[type](name, name, name, GObject.ParamFlags.READWRITE, ...dflt);

function buildPrefsWidget() {
    return new ExtensionListPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

var AppBtn = class extends Gtk.Box {
    static {
        GObject.registerClass({
            Properties: {
                app: genParam('string', 'app', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor() {
        super({ valign: Gtk.Align.CENTER, css_classes: ['linked'] }); // no 'always-show-image'
        let box = new Gtk.Box({ spacing: 5 });
        this._icon = new Gtk.Image({ css_classes: ['icon-dropshadow'] });
        this._label = new Gtk.Label();
        [this._icon, this._label].forEach(x => box.append(x));
        this._btn = new Gtk.Button({ child: box });
        let reset = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') });
        reset.connect('clicked', () => (this.app = ''));
        this._btn.connect('clicked', this._onClicked.bind(this));
        [this._btn, reset].forEach(x => this.append(x));
    }

    _onClicked(widget) {
        let chooser = new Gtk.AppChooserDialog({ modal: Gtk.DialogFlags.MODAL, transient_for: widget.get_root() });
        let updateSensitivity = () => {
            let appInfo = chooser.get_widget().get_app_info();
            chooser.set_response_sensitive(Gtk.ResponseType.OK, appInfo && this.app !== appInfo.get_id());
        };
        updateSensitivity();
        chooser.get_widget().set({ show_all: true, show_other: true });
        chooser.get_widget().connect('application-selected', updateSensitivity);
        chooser.connect('response', (wdg, res) => {
            if(res === Gtk.ResponseType.OK) this.app = wdg.get_widget().get_app_info().get_id();
            chooser.destroy();
        });
        chooser.show();
    }

    vfunc_mnemonic_activate() {
        this._btn.activate();
    }

    get app() {
        return this._app ?? '';
    }

    set app(id) {
        let prev = this._app;
        let info = Gio.DesktopAppInfo.new(id);
        if(info) {
            this._label.set_label(info.get_display_name());
            this._icon.set_from_gicon(info.get_icon());
            this._app = id;
        } else {
            this._icon.icon_name = 'application-x-addon-symbolic';
            this._label.set_label(_('(e.g.o)'));
            this._app = null;
        }
        if(prev !== undefined && prev !== this.app) {
            this.notify('app');
            this.emit('changed', this.app);
        }
    }
};

class ExtensionListPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({ title: _('Toolbar'), header_suffix: new Gtk.Label({ label: _('Icon') }) });
        Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).add_search_path(Me.dir.get_child('icons').get_path());
        this._buildWidgets();
        this._buildUI();
    }

    _buildWidgets() {
        this._block = new Block({
            app: [Fields.EXTAPP, 'app',    new AppBtn()],
            dev: [Fields.DEBUG,  'active', new Gtk.CheckButton()],
            del: [Fields.DELBTN, 'active', new Gtk.CheckButton()],
            dis: [Fields.DISBTN, 'active', new Gtk.CheckButton()],
            ext: [Fields.EXTBTN, 'active', new Gtk.CheckButton()],
            pin: [Fields.PINBTN, 'active', new Gtk.CheckButton()],
            url: [Fields.URLBTN, 'active', new Gtk.CheckButton()],
        });
    }

    _buildUI() {
        [
            [this._block.ext, [_('Extension'), _('Open <i>extensions.gnome.org</i> or…')], this._block.app],
            [this._block.dis, [_('Disabled'), _('Hide/Unhide disabled extensions from menu')], genIcon(Icons.COOL)],
            [this._block.del, [_('Delete'), _('Toggle delete button from menu items')], genIcon(Icons.DEL)],
            [this._block.url, [_('URL'), _('Toggle url button from menu items')], genIcon(Icons.URL)],
            [this._block.pin, [_('Pin'), _('Toggle menu for pin/unpin extensions')], genIcon(Icons.EOPEN)],
            [this._block.dev, [_('Debug'), _('Restart GNOME Shell or launch a nested Shell session')], genIcon(Icons.DEBUG)],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}
