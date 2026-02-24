import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const boldPlugin: PluginDefinition = {
  name: 'bold',

  markTypes: [{
    name: 'bold',
    toDOM: () => ['strong', {}],
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-bold', (editor) => toggleMarkOrStore(editor, 'bold'));
    ctx.keymap.register('Mod-b', 'toggle-bold');
  },

  toolbarItems: [{
    name: 'bold',
    icon: ICONS.bold,
    title: 'Bold (Ctrl+B)',
    command: 'toggle-bold',
    isActive: (state) => isMarkActive(state, 'bold'),
    order: 10,
  }],
};
