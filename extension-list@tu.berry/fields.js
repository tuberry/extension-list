// vim:fdm=syntax
// by tuberry
/* exported Fields Field Icons */
'use strict';

var Icons = {
    COOL:  'face-cool-symbolic',
    DEL:   'edit-delete-symbolic',
    URL:   'mail-forward-symbolic',
    SET:   'emblem-system-symbolic',
    EDOWN: 'eye-not-looking-symbolic',
    ADDON: 'application-x-addon-symbolic',
    DEBUG: 'applications-engineering-symbolic',
    EOPEN: 'eye-open-negative-filled-symbolic',
};

var Fields = {
    EXTAPP:   'ext-app',
    DELBTN:   'del-button',
    DISBTN:   'dis-button',
    EXTBTN:   'ext-button',
    PINBTN:   'pin-button',
    UPLIST:   'unpin-list',
    URLBTN:   'url-button',
    ICON:     'button-icon',
    DEBUG:    'debug-button',
    UNPIN:    'toggle-unpin',
    DISABLED: 'hide-disabled',
};

var Field = class {
    constructor(prop, gset, obj, tie) {
        this.prop = new WeakMap();
        this.gset = typeof gset === 'string' ? new imports.gi.Gio.Settings({ schema: gset }) : gset;
        this.attach(prop, obj, tie);
    }

    get(k, a) {
        return this.gset[`get_${this.prop.get(a)[k][1]}`](this.prop.get(a)[k][0]);
    }

    set(k, v, a) {
        this.gset[`set_${this.prop.get(a)[k][1]}`](this.prop.get(a)[k][0], v);
    }

    attach(ps, a, n) { // n && ps <- { field: [key, type, output] }
        a.setf ??= (k, v, f) => a[`_${f ?? ''}field`].set(k, v, a);
        if(!this.prop.has(a)) this.prop.set(a, ps);
        else Object.assign(this.prop.get(a), ps);
        let cb = n ? x => { a[n] = [x, this.get(x, a), this.prop.get(a)[x][2]]; } : x => { a[x] = this.get(x, a); };
        let fs = Object.entries(ps);
        fs.forEach(([k]) => cb(k));
        this.gset.connectObject(...fs.flatMap(([k, [x]]) => [`changed::${x}`, () => cb(k)]), a);
        return this;
    }

    detach(a) {
        this.gset.disconnectObject(a);
    }
};
