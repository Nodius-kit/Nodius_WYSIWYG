import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkExclusiveOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const superscriptPlugin: PluginDefinition = {
  name: 'superscript',

  markTypes: [{
    name: 'superscript',
    toDOM: () => ['sup', {}],
    parseDOM: [{ tag: 'sup' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-superscript', (editor) => toggleMarkExclusiveOrStore(editor, 'superscript', 'subscript'));
    ctx.keymap.register('Mod-.', 'toggle-superscript');
  },

  toolbarItems: [{
    name: 'superscript',
    icon: ICONS.superscript,
    title: 'Superscript (Ctrl+.)',
    command: 'toggle-superscript',
    isActive: (state) => isMarkActive(state, 'superscript'),
    order: 37,
  }],
};
