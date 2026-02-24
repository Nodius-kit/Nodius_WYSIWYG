import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const italicPlugin: PluginDefinition = {
  name: 'italic',

  markTypes: [{
    name: 'italic',
    toDOM: () => ['em', {}],
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-italic', (editor) => toggleMarkOrStore(editor, 'italic'));
    ctx.keymap.register('Mod-i', 'toggle-italic');
  },

  toolbarItems: [{
    name: 'italic',
    icon: ICONS.italic,
    title: 'Italic (Ctrl+I)',
    command: 'toggle-italic',
    isActive: (state) => isMarkActive(state, 'italic'),
    order: 20,
  }],
};
