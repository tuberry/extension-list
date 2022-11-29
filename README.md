# extension-list

Simple GNOME Shell extension manager in the top panel.
> Keep it simple. —— *stupid*<br>
[![license]](/LICENSE)
</br>

![image](https://user-images.githubusercontent.com/17917040/92874384-939c5c80-f43a-11ea-9e2a-887a113efaf2.png)

## Installation

### Manual

The latest and supported version should only work on the most current stable version of GNOME Shell.

```bash
git clone https://github.com/tuberry/extension-list.git && cd extension-list
make && make install
```

For older versions, it's necessary to switch the git tag before `make`:

```bash
# git tag # to see available versions
git checkout your_gnome_shell_version
```

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Features

* The DOT ornament means the extension is enabled;
* Click the menu item to enable/disable an extension;

## Acknowledgements

* [extensions](https://github.com/petres/gnome-shell-extension-extensions): the idea

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3088/extension-list/
