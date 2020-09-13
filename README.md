# extension-list
Simple gnome shell extension manager in top panel. Click the entry to enable/disable an extension.
> Keep it simple. —— *stupid*<br>
[![license]](/LICENSE)
</br>

![image](https://user-images.githubusercontent.com/17917040/92874384-939c5c80-f43a-11ea-9e2a-887a113efaf2.png)

## Installation
[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

Or manually:
```shell
git clone git@github.com:tuberry/extension-list.git
cp -r ./extension-list/extension-list@tu.berry ~/.local/share/gnome-shell/extensions/
```

## Usage
The DOT ornament means the extension is enabled and you can click the menu item to enable/disable an extension.

Also, here is a debug button for extension developers, which just restarts gnome shell on Xorg or launchs a nested [session](https://wiki.gnome.org/Projects/GnomeShell/Development) on Wayland. You can turn it on manually:
```shell
dconf write /org/gnome/shell/extensions/extension-list/debug-button true
```

## Acknowledgements
* [extensions](https://github.com/petres/gnome-shell-extension-extensions): the idea

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3088/extension-list/
