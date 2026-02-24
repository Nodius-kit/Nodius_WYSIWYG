import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const strikethroughPlugin: PluginDefinition = {
  name: 'strikethrough',

  markTypes: [{
    name: 'strikethrough',
    toDOM: () => ['s', {}],
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-strikethrough', (editor) => toggleMarkOrStore(editor, 'strikethrough'));
    ctx.keymap.register('Mod-Shift-x', 'toggle-strikethrough');
  },

  toolbarItems: [{
    name: 'strikethrough',
    icon: ICONS.strikethrough,
    title: 'Strikethrough (Ctrl+Shift+X)',
    command: 'toggle-strikethrough',
    isActive: (state) => isMarkActive(state, 'strikethrough'),
    order: 35,
  }],
};
