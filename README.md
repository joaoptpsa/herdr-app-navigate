# herdr-app-navigate

A [Herdr](https://herdr.dev) desktop app mod: press `ctrl-shift-g` and walk the tab with `h/j/k/l`
and spaces with `↑/↓`, without pressing the binding again between moves. A minimap of the tab's
split layout shows which pane you're in. A digit jumps to that space; Escape or Enter leaves.

![Navigate](preview.png)

It is the desktop-app counterpart of terminal herdr's navigate mode (`workspace_picker`,
`prefix+w`).

It makes no network requests and runs no programs. It reads one file outside its folder:
`~/.local/state/herdr-core/default/docs.json`, herdr-core's copy of the app's layout, for the
minimap. Mods get no pane positions from Herdr, so that file is the only source. Where it is
missing (another state path, a herdr-core session other than `default`, or a changed format), the
minimap falls back to a list of the tab's panes and navigation still works.

## Install

Copy `mods/navigate/` into `~/.config/herdr-app/mods/`, then add the binding from `keys.json` to
the `global` section of `~/.config/herdr-app/keys.json`. Check it loads:

```sh
herdr-app check ~/.config/herdr-app/mods/navigate
```

`RECIPE.md` describes the mod in full, for rebuilding or changing it.

## License

MIT
