import type { PluginDefinition, EditorInterface, ElementNode } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';

function insertHR(editor: EditorInterface): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const blockIndex = state.selection.anchor.blockIndex;

  const hrNode: ElementNode = {
    id: generateId(),
    kind: 'element',
    type: 'horizontal_rule',
    attrs: {},
    children: [],
  };

  // Insert HR after current block, then add empty paragraph after
  const emptyParagraph: ElementNode = {
    id: generateId(),
    kind: 'element',
    type: 'paragraph',
    attrs: {},
    children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
  };

  editor.dispatch({
    operations: [
      { type: 'insert_node', path: [], offset: blockIndex + 1, data: hrNode },
      { type: 'insert_node', path: [], offset: blockIndex + 2, data: emptyParagraph },
    ],
    selection: {
      anchor: { blockIndex: blockIndex + 2, path: [], offset: 0 },
      focus: { blockIndex: blockIndex + 2, path: [], offset: 0 },
    },
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const horizontalRulePlugin: PluginDefinition = {
  name: 'horizontal_rule',

  nodeTypes: [{
    name: 'horizontal_rule',
    group: 'void',
    toDOM: () => ['hr', {}],
    parseDOM: [{ tag: 'hr' }],
  }],

  init(ctx) {
    ctx.commands.register('insert-hr', (editor) => insertHR(editor));
  },

  toolbarItems: [{
    name: 'horizontal-rule',
    icon: ICONS.horizontalRule,
    title: 'Horizontal Rule',
    command: 'insert-hr',
    order: 70,
  }],
};
