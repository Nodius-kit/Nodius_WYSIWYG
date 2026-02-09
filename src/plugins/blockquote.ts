import type { PluginDefinition, EditorInterface, ElementNode } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';

function toggleBlockquote(editor: EditorInterface): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const blockIndex = state.selection.anchor.blockIndex;
  const block = state.doc.children[blockIndex];
  if (!block) return false;

  if (block.type === 'blockquote') {
    // Unwrap: replace blockquote with its children as top-level blocks
    const paragraphs: ElementNode[] = [];
    for (const child of block.children) {
      if (child.kind === 'element') {
        paragraphs.push(child);
      }
    }

    if (paragraphs.length === 0) {
      paragraphs.push({
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
      });
    }

    const ops: any[] = [
      { type: 'delete_node', path: [], offset: blockIndex },
    ];
    for (let i = 0; i < paragraphs.length; i++) {
      ops.push({
        type: 'insert_node',
        path: [],
        offset: blockIndex + i,
        data: paragraphs[i],
      });
    }

    editor.dispatch({ operations: ops, origin: 'command', timestamp: Date.now() });
    return true;
  }

  // Wrap current block in blockquote
  const bq: ElementNode = {
    id: generateId(),
    kind: 'element',
    type: 'blockquote',
    attrs: {},
    children: [block],
  };

  editor.dispatch({
    operations: [
      { type: 'delete_node', path: [], offset: blockIndex },
      { type: 'insert_node', path: [], offset: blockIndex, data: bq },
    ],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const blockquotePlugin: PluginDefinition = {
  name: 'blockquote',

  nodeTypes: [{
    name: 'blockquote',
    group: 'block',
    content: 'block+',
    toDOM: () => ['blockquote', {}],
    parseDOM: [{ tag: 'blockquote' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-blockquote', (editor) => toggleBlockquote(editor));
    ctx.keymap.register('Mod-Shift-b', 'toggle-blockquote');
  },

  toolbarItems: [{
    name: 'blockquote',
    icon: ICONS.blockquote,
    title: 'Blockquote (Ctrl+Shift+B)',
    command: 'toggle-blockquote',
    isActive: (state) => {
      if (!state.selection) return false;
      const block = state.doc.children[state.selection.anchor.blockIndex];
      return block?.type === 'blockquote';
    },
    order: 60,
  }],
};
