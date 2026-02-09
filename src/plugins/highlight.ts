import type { PluginDefinition, EditorInterface, ContentState, Mark } from '../core/types';
import { isTextNode } from '../core/types';
import { ICONS } from '../assets/icons';

function selectionHasMark(state: ContentState, markType: string): boolean {
  if (!state.selection) return false;
  const { anchor } = state.selection;
  const block = state.doc.children[anchor.blockIndex];
  if (!block) return false;

  let pos = 0;
  for (const child of block.children) {
    if (!isTextNode(child)) continue;
    const end = pos + child.text.length;
    if (anchor.offset >= pos && anchor.offset <= end) {
      return child.marks.some((m) => m.type === markType);
    }
    pos = end;
  }
  return false;
}

function toggleHighlight(editor: EditorInterface, color?: string): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);
  if (from === to) return false;

  const hasMark = selectionHasMark(state, 'highlight');
  const mark: Mark = {
    type: 'highlight',
    ...(color ? { attrs: { color } } : {}),
  };

  editor.dispatch({
    operations: [{
      type: hasMark ? 'remove_mark' : 'add_mark',
      path: [anchor.blockIndex],
      offset: from,
      length: to - from,
      mark,
    }],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const highlightPlugin: PluginDefinition = {
  name: 'highlight',

  markTypes: [{
    name: 'highlight',
    attrs: { color: { default: 'yellow' } },
    toDOM: (mark: Mark) => ['mark', {
      style: `background-color: ${String(mark.attrs?.color ?? 'yellow')}`,
    }],
    parseDOM: [{
      tag: 'mark',
      getAttrs: (dom: HTMLElement) => {
        const bg = dom.style.backgroundColor;
        return { color: bg || 'yellow' };
      },
    }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-highlight', (editor, args) => {
      const color = args?.color as string | undefined;
      return toggleHighlight(editor, color);
    });
    ctx.keymap.register('Mod-Shift-h', 'toggle-highlight');
  },

  toolbarItems: [{
    name: 'highlight',
    icon: ICONS.highlight,
    title: 'Highlight (Ctrl+Shift+H)',
    command: 'toggle-highlight',
    isActive: (state) => selectionHasMark(state, 'highlight'),
    order: 38,
  }],
};
