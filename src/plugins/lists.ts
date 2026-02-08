import type { PluginDefinition, EditorInterface, ElementNode } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';

type ListType = 'ordered_list' | 'unordered_list';

function isInList(editor: EditorInterface, listType?: ListType): boolean {
  const state = editor.getState();
  if (!state.selection) return false;
  const block = state.doc.children[state.selection.anchor.blockIndex];
  if (!block) return false;
  if (listType) return block.type === listType;
  return block.type === 'ordered_list' || block.type === 'unordered_list';
}

function toggleList(editor: EditorInterface, listType: ListType): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const blockIndex = state.selection.anchor.blockIndex;
  const block = state.doc.children[blockIndex];
  if (!block) return false;

  if (block.type === listType) {
    // Unwrap: list -> lift to get paragraphs back
    // Replace list node with its children as paragraphs at doc level
    const paragraphs: ElementNode[] = [];
    for (const child of block.children) {
      if (child.kind === 'element' && child.type === 'list_item') {
        // Each list_item's children become top-level blocks
        for (const inner of child.children) {
          if (inner.kind === 'element') {
            paragraphs.push({ ...inner, type: 'paragraph' });
          }
        }
      } else if (child.kind === 'element') {
        paragraphs.push({ ...child, type: 'paragraph' });
      }
    }

    if (paragraphs.length === 0) {
      paragraphs.push({
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
      });
    }

    // Delete old list and insert paragraphs
    const ops = [
      { type: 'delete_node' as const, path: [] as number[], offset: blockIndex },
    ];
    for (let i = 0; i < paragraphs.length; i++) {
      ops.push({
        type: 'insert_node' as const,
        path: [] as number[],
        offset: blockIndex + i,
        data: paragraphs[i],
      } as any);
    }

    editor.dispatch({ operations: ops, origin: 'command', timestamp: Date.now() });
    return true;
  }

  // If it's a different list type, just change the type
  if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    editor.dispatch({
      operations: [{ type: 'set_node_type', path: [blockIndex], nodeType: listType }],
      origin: 'command',
      timestamp: Date.now(),
    });
    return true;
  }

  // Wrap paragraph into list
  // paragraph -> list_item -> list_type
  const listItem: ElementNode = {
    id: generateId(),
    kind: 'element',
    type: 'list_item',
    attrs: {},
    children: [block],
  };
  const list: ElementNode = {
    id: generateId(),
    kind: 'element',
    type: listType,
    attrs: {},
    children: [listItem],
  };

  editor.dispatch({
    operations: [
      { type: 'delete_node', path: [], offset: blockIndex },
      { type: 'insert_node', path: [], offset: blockIndex, data: list },
    ],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const listsPlugin: PluginDefinition = {
  name: 'lists',

  nodeTypes: [
    {
      name: 'ordered_list',
      group: 'block',
      content: 'list_item+',
      toDOM: () => ['ol', {}],
      parseDOM: [{ tag: 'ol' }],
    },
    {
      name: 'unordered_list',
      group: 'block',
      content: 'list_item+',
      toDOM: () => ['ul', {}],
      parseDOM: [{ tag: 'ul' }],
    },
    {
      name: 'list_item',
      group: 'block',
      content: 'block+',
      toDOM: () => ['li', {}],
      parseDOM: [{ tag: 'li' }],
    },
  ],

  init(ctx) {
    ctx.commands.register('toggle-ordered-list', (editor) => toggleList(editor, 'ordered_list'));
    ctx.commands.register('toggle-unordered-list', (editor) => toggleList(editor, 'unordered_list'));
  },

  toolbarItems: [
    {
      name: 'ordered-list',
      icon: ICONS.orderedList,
      title: 'Ordered List',
      command: 'toggle-ordered-list',
      isActive: (state) => {
        if (!state.selection) return false;
        const block = state.doc.children[state.selection.anchor.blockIndex];
        return block?.type === 'ordered_list';
      },
      order: 50,
    },
    {
      name: 'unordered-list',
      icon: ICONS.unorderedList,
      title: 'Unordered List',
      command: 'toggle-unordered-list',
      isActive: (state) => {
        if (!state.selection) return false;
        const block = state.doc.children[state.selection.anchor.blockIndex];
        return block?.type === 'unordered_list';
      },
      order: 51,
    },
  ],
};
