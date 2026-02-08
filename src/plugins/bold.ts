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

function toggleMark(editor: EditorInterface, markType: string): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);
  if (from === to) return false;

  const hasMark = selectionHasMark(state, markType);
  const mark: Mark = { type: markType };

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

export const boldPlugin: PluginDefinition = {
  name: 'bold',

  markTypes: [{
    name: 'bold',
    toDOM: () => ['strong', {}],
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-bold', (editor) => toggleMark(editor, 'bold'));
    ctx.keymap.register('Mod-b', 'toggle-bold');
  },

  toolbarItems: [{
    name: 'bold',
    icon: ICONS.bold,
    title: 'Bold (Ctrl+B)',
    command: 'toggle-bold',
    isActive: (state) => selectionHasMark(state, 'bold'),
    order: 10,
  }],
};
