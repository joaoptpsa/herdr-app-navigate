# Navigate

A keyboard mode for the Herdr desktop app that moves focus across panes and spaces one key at a
time. Press the binding once and a small window stays open: `h/j/k/l` walk the panes of the
shown tab, `↑/↓` walk spaces, a digit jumps to that space, and a minimap of the tab's split
layout fills in the pane you're in, so you always see where the keyboard will land. Escape or
Enter leaves with focus where you stopped.

![Navigate](preview.png)

## What you see

- A window overlay 520px wide, centered over the app, on the theme's `popover` color with
  Herdr's own window frame. 12px padding, 10px between its three rows, 13px text.
- A header: "Navigate", 15px semibold in `foreground`, then 8px later the focused space's
  position and name two spaces apart (`2  demo`) in `dim`, truncated.
- The minimap, 496×170px: the focused tab's split tree drawn as nested rows and columns with 4px
  gaps. Each split's children share its width (row) or height (column) by their weights. Each
  pane is a box with 5px corners and a 1px border, its program's name (else its title, else its
  mod's name) centered and truncated with 6px side padding:
  - the focused pane: `accent` fill and border, `accent_foreground` semibold text;
  - every other pane: `raised` fill, `border` border, `muted` text.
- Without a split tree for the tab, the minimap is a list instead: one 28px box per pane of the
  tab in `panes()` order, styled the same way.
- A hint row, 14px apart: `h j k l` pane, `↑ ↓` space, `1-9` go to space, `esc` done. Each key is a chip with 6px
  side padding and 4px corners, semibold `foreground` on `raised`, followed 6px later by its
  action in `muted`.

## How it behaves

- `h`, `j`, `k`, `l` run `pane.go` left, down, up, right; `←` and `→` go left and right too. The
  window stays open and the minimap's highlight moves.
- `↑` and `↓` run `space.prev` and `space.next`: the header and minimap switch to that space's
  shown tab.
- `1` to `9` run `space.select {index}` for that position and close the window: a jump is the
  last key of a navigation.
- Escape, Enter, ctrl-g and ctrl-c close the window. Focus stays on the pane reached.
- Every other key is swallowed: nothing reaches the terminal underneath while the window is open.
- Agent status doesn't change the minimap. Running the binding again closes the window
  (`mod.open` toggles).

## Built from

- One mod, `mods/navigate/` (`main.js`, `mod.json`), opened as an overlay. No layout changes.
- `mod.json`: `{ "place": "none", "title": "Navigate", "overlay": { "kind": "window",
  "width": 520 } }`.
- `keys.json` binds it: `"ctrl-shift-g": "mod.open:navigate"` in `global`.
- `herdr` functions: `focused()` for the shown space and tab, `spaces()` for the space's name,
  `panes()` for the tab's panes and which is focused, `home()` and `readTextFile` for the split
  tree, `theme()`, `props().overlay` with `closeOverlay`, and `run` for `pane.go {direction}`,
  `space.prev`, `space.next` and `space.select {index}`.
- The split tree: `readTextFile(home() + "/.local/state/herdr-core/default/docs.json")`, parsed
  as `{"herdr-app": {"value": {"spaces": [{"tabs": [{"id", "root"}]}]}}}`. A `root` node is
  `{id, type: "row" | "column" | "block", children?, size?: {weight}}`; a node without children
  is a pane whose `id` matches `PaneInfo.pane`. Missing weights share evenly. Read once in
  `init` with `cx.spawn`, kept by tab id.
- `gpui-kit`: `div`; `gpui-base`: `h_flex`, `v_flex`. Keyboard: a `cx.focus_handle()` made in
  `init`, focused at once and again 100ms later, attached with `.track_focus()`;
  `.on_key_down` compares `event.keystroke`.
- No `exec`, `fetch` or `hc`.

## Watch out

- Use a `window` overlay, not a `popup`: a popup closes as soon as `pane.go` moves focus to a
  pane, which ends the mode after one move.
- The window holds the keyboard, so Herdr's own focus border isn't a usable guide; the minimap
  is what shows the focused pane.
- After each `run`, focus the handle again at once and 50ms later, or the pane the move reached
  can take the keyboard and the next `h` types into it.
- Call `cx.stop_propagation()` on every key, not just navigation keys, or unhandled keys type
  into the terminal under the window.
- Mods get no pane geometry; `docs.json` is undocumented herdr-core state. Read it defensively
  and fall back to the pane list when the tab isn't in it. A space move can land on a tab made
  after the window opened: read the file again when the focused tab isn't in the cache.
- The path assumes Linux default state paths and herdr-core's `default` session.
- Up and down are spaces, not panes, as in terminal herdr's navigate mode; `j` and `k` are the
  vertical pane moves.

## Done when

- `herdr-app check mods/navigate` passes.
- In a tab split into a left pane and a right column of two, the binding opens the window with a
  minimap of one box on the left and two stacked on the right, the focused one filled.
- `l` then `j` moves the highlight to the right column's lower box, and that pane has the
  keyboard once Escape closes the window.
- `↓` switches to the next space and the minimap redraws for its tab.
- `1` shows the first space and closes the window.
- Typing a letter that isn't a navigation key does nothing: the window stays open and the
  terminal underneath receives nothing.
