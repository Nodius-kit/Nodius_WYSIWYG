import type { PluginDefinition } from '../core/types';
import { isMarkActive, toggleMarkOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';

export const underlinePlugin: PluginDefinition = {
  name: 'underline',

  markTypes: [{
    name: 'underline',
    toDOM: () => ['u', {}],
    parseDOM: [{ tag: 'u' }],
  }],

  init(ctx) {
    ctx.commands.register('toggle-underline', (editor) => toggleMarkOrStore(editor, 'underline'));
    ctx.keymap.register('Mod-u', 'toggle-underline');
  },

  toolbarItems: [{
    name: 'underline',
    icon: ICONS.underline,
    title: 'Underline (Ctrl+U)',
    command: 'toggle-underline',
    isActive: (state) => isMarkActive(state, 'underline'),
    order: 30,
  }],
};
