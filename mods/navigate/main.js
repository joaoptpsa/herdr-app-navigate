/**
 * @fileoverview Navigate mode from the terminal herdr's workspace_picker:
 * while open, h/j/k/l and left/right move pane focus, up/down change space,
 * a digit jumps to that space and leaves, and Escape or Enter leaves. It stays open between moves, so a run of
 * keys walks across panes without the prefix each time. The window holds the
 * keyboard, so it draws the tab's split layout with the focused pane filled
 * in; herdr-app's own focus border is too faint to follow.
 */

import {View, div} from 'gpui-kit';
import {h_flex, v_flex} from 'gpui-base';
import {
  closeOverlay,
  focused,
  home,
  panes,
  props,
  readTextFile,
  run,
  spaces,
  theme,
} from 'herdr';

/** Keystrokes that move pane focus, as the terminal herdr's defaults. */
const PANE_DIRECTIONS = new Map([
  ['h', 'left'],
  ['j', 'down'],
  ['k', 'up'],
  ['l', 'right'],
  ['left', 'left'],
  ['right', 'right'],
]);

/** Keystrokes that change space; up and down are spaces, not panes. */
const SPACE_COMMANDS = new Map([
  ['up', 'space.prev'],
  ['down', 'space.next'],
]);

const LEAVE_KEYSTROKES = new Set(['escape', 'enter', 'ctrl-g', 'ctrl-c']);

/** A digit jumps to the space at that position and leaves. */
const SPACE_INDEX_KEYSTROKE = /^[1-9]$/;

/** Delay before taking the keyboard back after a move, in ms. */
const REFOCUS_DELAY = 50;

/**
 * herdr-core's copy of herdr-app's document, which holds each tab's split
 * tree. Mods get no pane geometry, so this undocumented file is the only
 * source; when its shape changes the window falls back to a pane list.
 */
const DOCUMENT_PATH = '.local/state/herdr-core/default/docs.json';

/** Minimap size in px, matching the window's inner width. */
const MAP_WIDTH = 496;
const MAP_HEIGHT = 170;
const MAP_GAP = 4;

/**
 * Reads every tab's split tree, keyed by tab id.
 * @return {!Promise<!Map<string, !Object>>}
 */
async function readTabTrees() {
  const text = await readTextFile(`${home()}/${DOCUMENT_PATH}`);
  const trees = new Map();
  if (!text) {
    return trees;
  }
  const document = JSON.parse(text);
  const documentSpaces = document?.['herdr-app']?.value?.spaces ?? [];
  for (const space of documentSpaces) {
    for (const tab of space.tabs ?? []) {
      if (tab.root) {
        trees.set(tab.id, tab.root);
      }
    }
  }
  return trees;
}

/**
 * Splits a length between siblings by their weights, after the gaps.
 * @param {!Array<!Object>} children
 * @param {number} length
 * @return {!Array<number>}
 */
function childLengths(children, length) {
  const evenShare = 1 / children.length;
  const weights = children.map((child) => child.size?.weight ?? evenShare);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const usable = length - MAP_GAP * (children.length - 1);
  const lengths = weights.map(
      (weight) => Math.floor(usable * weight / totalWeight));
  return lengths;
}

/**
 * Returns a pane's short label: its program, else its title.
 * @param {!Object|undefined} pane
 * @return {string}
 */
function paneLabel(pane) {
  const label = pane?.program?.name || pane?.title || pane?.mod || 'pane';
  return label;
}

/**
 * Returns the focused space's position and name, the number a digit jumps to.
 * @return {string}
 */
function focusedSpaceLabel() {
  const spaceId = focused()?.space;
  const space = spaces().find((candidate) => candidate.id === spaceId);
  if (!space) {
    return '';
  }
  const label = `${space.index}  ${space.name}`;
  return label;
}

/** A window that keeps the keyboard and turns keys into focus moves. */
export default class Navigate extends View {
  /**
   * Takes the keyboard so the first keystroke already moves, and loads the
   * split trees for the minimap.
   * @param {?Object} _props
   * @param {!Object} cx
   */
  init(_props, cx) {
    /** @type {!Object} */
    this.keyboard = cx.focus_handle();
    /** @type {!Map<string, !Object>} */
    this.tabTrees = new Map();
    /** @type {boolean} */
    this.treesLoading = false;
    this.keyboard.focus();
    // It can open before the app has keyboard focus.
    cx.timer.after(100, () => this.keyboard.focus());
    this.loadTabTrees(cx);
  }

  /**
   * Reads the split trees in the background and redraws when they arrive.
   * @param {!Object} cx
   */
  loadTabTrees(cx) {
    this.treesLoading = true;
    cx.spawn(async (cx) => {
      try {
        this.tabTrees = await readTabTrees();
      } catch (error) {
        console.log(`navigate: cannot read ${DOCUMENT_PATH}: ${error}`);
      }
      this.treesLoading = false;
      cx.notify();
    });
  }

  /** Closes this window. */
  close() {
    closeOverlay(props().overlay);
  }

  /**
   * Runs a focus move, then takes the keyboard back from the pane it reached.
   * A space move can land on a tab made after the trees were read, so that
   * reads them again.
   * @param {string} command
   * @param {!Object} args
   * @param {!Object} cx
   */
  move(command, args, cx) {
    run(command, args);
    this.keyboard.focus();
    cx.timer.after(REFOCUS_DELAY, (cx) => {
      this.keyboard.focus();
      const tabId = focused()?.tab;
      if (tabId && !this.tabTrees.has(tabId) && !this.treesLoading) {
        this.loadTabTrees(cx);
      }
      cx.notify();
    });
    cx.notify();
  }

  /**
   * Moves focus for a navigation key, leaves on a leave key, and swallows
   * the rest so nothing reaches the terminal underneath.
   * @param {!Object} event
   * @param {!Object} cx
   */
  onKeyDown(event, cx) {
    cx.stop_propagation();
    const keystroke = event.keystroke;
    if (LEAVE_KEYSTROKES.has(keystroke)) {
      this.close();
      return;
    }
    if (SPACE_INDEX_KEYSTROKE.test(keystroke)) {
      run('space.select', {index: Number(keystroke)});
      this.close();
      return;
    }
    const direction = PANE_DIRECTIONS.get(keystroke);
    if (direction) {
      this.move('pane.go', {direction}, cx);
      return;
    }
    const spaceCommand = SPACE_COMMANDS.get(keystroke);
    if (spaceCommand) {
      this.move(spaceCommand, {}, cx);
    }
  }

  /**
   * Draws one pane of the minimap, filled when it has focus.
   * @param {!Object|undefined} pane
   * @param {number} width
   * @param {number} height
   * @param {!Object} colors
   * @return {!Object}
   */
  paneBox(pane, width, height, colors) {
    const isFocused = pane?.focused ?? false;
    return div()
        .w(width).h(height).flex_none().overflow_hidden()
        .rounded(5).border(1)
        .flex().items_center().justify_center()
        .border_color(isFocused ? colors.accent : colors.border)
        .bg(isFocused ? colors.accent : colors.raised)
        .text_color(isFocused ? colors.accent_foreground : colors.muted)
        .when(isFocused, (element) => element.font_semibold())
        .child(div().px(6).truncate().child(paneLabel(pane)));
  }

  /**
   * Draws a split tree node at a given size: a pane, a row or a column.
   * @param {!Object} node
   * @param {number} width
   * @param {number} height
   * @param {!Map<string, !Object>} panesById
   * @param {!Object} colors
   * @return {!Object}
   */
  treeNode(node, width, height, panesById, colors) {
    const children = node.children ?? [];
    if (children.length === 0) {
      return this.paneBox(panesById.get(node.id), width, height, colors);
    }
    const isColumn = node.type === 'column';
    const lengths = childLengths(children, isColumn ? height : width);
    const container = isColumn ? v_flex() : h_flex();
    return container
        .w(width).h(height).flex_none().gap(MAP_GAP)
        .children(children.map((child, index) => isColumn ?
            this.treeNode(child, width, lengths[index], panesById, colors) :
            this.treeNode(child, lengths[index], height, panesById, colors)));
  }

  /**
   * Draws the focused tab's panes in their places, or as a list when the
   * split tree is unavailable.
   * @param {!Object} colors
   * @return {!Object}
   */
  minimap(colors) {
    const tabId = focused()?.tab;
    const tabPanes = panes().filter((pane) => pane.tab === tabId);
    const panesById = new Map(tabPanes.map((pane) => [pane.pane, pane]));
    const tree = this.tabTrees.get(tabId);
    if (tree) {
      return this.treeNode(tree, MAP_WIDTH, MAP_HEIGHT, panesById, colors);
    }
    const rowHeight = 28;
    return v_flex()
        .gap(MAP_GAP)
        .children(tabPanes.map(
            (pane) => this.paneBox(pane, MAP_WIDTH, rowHeight, colors)));
  }

  /**
   * Draws a key and what it does.
   * @param {string} keys
   * @param {string} action
   * @param {!Object} colors
   * @return {!Object}
   */
  hint(keys, action, colors) {
    return h_flex()
        .gap(6).items_center()
        .child(div()
            .px(6).rounded(4)
            .bg(colors.raised)
            .text_color(colors.foreground)
            .font_semibold()
            .child(keys))
        .child(div().text_color(colors.muted).child(action));
  }

  /**
   * @override
   * @return {!Object}
   */
  render() {
    const colors = theme();
    return v_flex()
        .id('navigate')
        .track_focus(this.keyboard)
        .on_key_down((event, cx) => this.onKeyDown(event, cx))
        .w_full().p(12).gap(10)
        .bg(colors.popover)
        .text_size(13)
        .child(h_flex()
            .gap(8).items_center()
            .child(div()
                .text_size(15).font_semibold()
                .text_color(colors.foreground)
                .child('Navigate'))
            .child(div().flex_1().truncate().text_color(colors.dim)
                .child(focusedSpaceLabel())))
        .child(this.minimap(colors))
        .child(h_flex()
            .gap(14)
            .child(this.hint('h j k l', 'pane', colors))
            .child(this.hint('↑ ↓', 'space', colors))
            .child(this.hint('1-9', 'go to space', colors))
            .child(this.hint('esc', 'done', colors)));
  }
}
