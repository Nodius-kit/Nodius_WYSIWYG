import type { PluginDefinition, EditorInterface } from '../core/types';
import { ICONS } from '../assets/icons';

export const codeBlockPlugin: PluginDefinition = {
  name: 'code_block',

  nodeTypes: [{
    name: 'code_block',
    group: 'block',
    content: 'text*',
    attrs: { language: { default: '' } },
    toDOM: (node) => {
      const lang = String(node.attrs.language ?? '');
      return ['pre', {}, ['code', lang ? { class: `language-${lang}` } : {}]];
    },
    parseDOM: [
      {
        tag: 'pre',
        getAttrs: (dom: HTMLElement) => {
          const code = dom.querySelector('code');
          const cls = code?.className ?? '';
          const match = cls.match(/language-(\w+)/);
          return { language: match ? match[1] : '' };
        },
      },
    ],
  }],

  init(ctx) {
    ctx.commands.register('toggle-code-block', (editor, args) => {
      const state = editor.getState();
      if (!state.selection) return false;

      const blockIndex = state.selection.anchor.blockIndex;
      const block = state.doc.children[blockIndex];
      if (!block) return false;

      // Toggle: if already code_block, revert to paragraph
      if (block.type === 'code_block') {
        editor.dispatch({
          operations: [
            { type: 'set_node_type', path: [blockIndex], nodeType: 'paragraph' },
          ],
          origin: 'command',
          timestamp: Date.now(),
        });
      } else {
        const language = (args?.language as string) ?? '';
        editor.dispatch({
          operations: [
            { type: 'set_node_type', path: [blockIndex], nodeType: 'code_block' },
            { type: 'update_attrs', path: [blockIndex], attrs: { language } },
          ],
          origin: 'command',
          timestamp: Date.now(),
        });
      }
      return true;
    });

    ctx.keymap.register('Mod-Shift-c', 'toggle-code-block');
  },

  toolbarItems: [{
    name: 'code-block',
    icon: ICONS.codeBlock,
    title: 'Code Block (Ctrl+Shift+C)',
    command: 'toggle-code-block',
    isActive: (state) => {
      if (!state.selection) return false;
      const block = state.doc.children[state.selection.anchor.blockIndex];
      return block?.type === 'code_block';
    },
    order: 65,
  }],
};
