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

function toggleMarkExclusive(editor: EditorInterface, markType: string, exclusiveWith: string): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);
  if (from === to) return false;

  const hasMark = selectionHasMark(state, markType);
  const hasExclusive = selectionHasMark(state, exclusiveWith);

  const ops = [];

  // Remove the exclusive mark first if present
  if (hasExclusive) {
    ops.push({
      type: 'remove_mark' as const,
      path: [anchor.blockIndex],
      offset: from,
      length: to - from,
      mark: { type: exclusiveWith },
    });
  }

  const mark: Mark = { type: markType };
  ops.push({
    type: hasMark ? 'remove_mark' as const : 'add_mark' as const,
    path: [anchor.blockIndex],
    offset: from,
    length: to - from,
    mark,
  });

  editor.dispatch({
    operations: ops,
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const subscriptPlugin: PluginDefinition = {
  name: 'subscript',

  markTypes: [{
    name: 'subscript',
    toDOM: () => ['sub', {}],
    parseDOM: [{ tag: 'sub' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-subscript', (editor) => toggleMarkExclusive(editor, 'subscript', 'superscript'));
    ctx.keymap.register('Mod-,', 'toggle-subscript');
  },

  toolbarItems: [{
    name: 'subscript',
    icon: ICONS.subscript,
    title: 'Subscript (Ctrl+,)',
    command: 'toggle-subscript',
    isActive: (state) => selectionHasMark(state, 'subscript'),
    order: 36,
  }],
};
