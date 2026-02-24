import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkExclusiveOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const subscriptPlugin: PluginDefinition = {
  name: 'subscript',

  markTypes: [{
    name: 'subscript',
    toDOM: () => ['sub', {}],
    parseDOM: [{ tag: 'sub' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-subscript', (editor) => toggleMarkExclusiveOrStore(editor, 'subscript', 'superscript'));
    ctx.keymap.register('Mod-,', 'toggle-subscript');
  },

  toolbarItems: [{
    name: 'subscript',
    icon: ICONS.subscript,
    title: 'Subscript (Ctrl+,)',
    command: 'toggle-subscript',
    isActive: (state) => isMarkActive(state, 'subscript'),
    order: 36,
  }],
};
