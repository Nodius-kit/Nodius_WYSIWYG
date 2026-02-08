import type { PluginDefinition, EditorInterface, ContentState } from '../core/types';
import { ICONS } from '../assets/icons';

export const headingPlugin: PluginDefinition = {
  name: 'heading',

  nodeTypes: [{
    name: 'heading',
    group: 'block',
    content: 'inline*',
    attrs: { level: { default: 1 } },
    toDOM: (node) => {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
      return [`h${level}` as string, {}];
    },
    parseDOM: [
      { tag: 'h1', getAttrs: () => ({ level: 1 }) },
      { tag: 'h2', getAttrs: () => ({ level: 2 }) },
      { tag: 'h3', getAttrs: () => ({ level: 3 }) },
      { tag: 'h4', getAttrs: () => ({ level: 4 }) },
      { tag: 'h5', getAttrs: () => ({ level: 5 }) },
      { tag: 'h6', getAttrs: () => ({ level: 6 }) },
    ],
  }],

  init(ctx) {
    ctx.commands.register('set-heading', (editor, args) => {
      const level = args?.level as number | undefined;
      const state = editor.getState();
      if (!state.selection) return false;

      const blockIndex = state.selection.anchor.blockIndex;
      const block = state.doc.children[blockIndex];
      if (!block) return false;

      // Toggle: if already heading with same level, revert to paragraph
      if (block.type === 'heading' && block.attrs.level === level) {
        editor.dispatch({
          operations: [
            { type: 'set_node_type', path: [blockIndex], nodeType: 'paragraph' },
          ],
          origin: 'command',
          timestamp: Date.now(),
        });
      } else {
        editor.dispatch({
          operations: [
            { type: 'set_node_type', path: [blockIndex], nodeType: 'heading' },
            { type: 'update_attrs', path: [blockIndex], attrs: { level: level ?? 1 } },
          ],
          origin: 'command',
          timestamp: Date.now(),
        });
      }
      return true;
    });

    // Keyboard shortcuts
    for (let i = 1; i <= 6; i++) {
      ctx.keymap.register(`Mod-Alt-${i}`, `set-heading`);
      // Register individual heading commands for keymap
      ctx.commands.register(`set-heading-${i}`, (editor) => {
        return ctx.commands.execute('set-heading', { level: i });
      });
      ctx.keymap.unregister(`Mod-Alt-${i}`);
      ctx.keymap.register(`Mod-Alt-${i}`, `set-heading-${i}`);
    }
  },

  toolbarItems: [
    {
      name: 'heading-1',
      icon: ICONS.heading1,
      title: 'Heading 1',
      command: 'set-heading',
      commandArgs: { level: 1 },
      isActive: (state) => {
        if (!state.selection) return false;
        const block = state.doc.children[state.selection.anchor.blockIndex];
        return block?.type === 'heading' && block.attrs.level === 1;
      },
      order: 40,
    },
    {
      name: 'heading-2',
      icon: ICONS.heading2,
      title: 'Heading 2',
      command: 'set-heading',
      commandArgs: { level: 2 },
      isActive: (state) => {
        if (!state.selection) return false;
        const block = state.doc.children[state.selection.anchor.blockIndex];
        return block?.type === 'heading' && block.attrs.level === 2;
      },
      order: 41,
    },
    {
      name: 'heading-3',
      icon: ICONS.heading3,
      title: 'Heading 3',
      command: 'set-heading',
      commandArgs: { level: 3 },
      isActive: (state) => {
        if (!state.selection) return false;
        const block = state.doc.children[state.selection.anchor.blockIndex];
        return block?.type === 'heading' && block.attrs.level === 3;
      },
      order: 42,
    },
  ],
};
