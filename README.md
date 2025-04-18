<!--
SPDX-FileCopyrightText: tuberry
SPDX-License-Identifier: CC-BY-SA-4.0
-->
# extension-list

Simple GNOME Shell extension manager in the top panel.
> Keep it simple. —— *stupid*\
[![license]](/LICENSE.md)

![image](https://github.com/user-attachments/assets/9cae1d62-0128-4bb9-a949-aeed2d95f21d)

## Installation

### Manual

The latest and supported version should only work on the [current stable version](https://release.gnome.org/calendar/#branches) of GNOME Shell.

```bash
git clone https://github.com/tuberry/extension-list.git && cd extension-list
meson setup build && meson install -C build
# meson setup build -Dtarget=system && meson install -C build # system-wide, default --prefix=/usr/local
```

For older versions, it's recommended to install via:

```bash
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
          --method org.gnome.Shell.Extensions.InstallRemoteExtension 'extension-list@tu.berry'
```

It's quite the same as installing from:

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Contributions

Feel free to open an issue or PR in the repo for any question or idea.

### Translations

To initialize or update the po file from sources:

```bash
bash ./cli/update-po.sh [your_lang_code] # like zh_CN, default to $LANG
```

### Developments

To install GJS TypeScript type [definitions](https://www.npmjs.com/package/@girs/gnome-shell):

```bash
npm install @girs/gnome-shell --save-dev
```

## Acknowledgements

* [extensions](https://github.com/petres/gnome-shell-extension-extensions): the idea

[license]:https://img.shields.io/badge/license-GPLv3+-green.svg
[EGO]:https://extensions.gnome.org/extension/3088/extension-list/
