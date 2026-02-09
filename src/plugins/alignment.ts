import type { PluginDefinition, EditorInterface, ContentState } from '../core/types';
import { ICONS } from '../assets/icons';

type Alignment = 'left' | 'center' | 'right' | 'justify';

function getBlockAlignment(state: ContentState): Alignment {
  if (!state.selection) return 'left';
  const block = state.doc.children[state.selection.anchor.blockIndex];
  if (!block) return 'left';
  return (block.attrs.textAlign as Alignment) ?? 'left';
}

function setAlignment(editor: EditorInterface, alignment: Alignment): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const blockIndex = state.selection.anchor.blockIndex;
  const block = state.doc.children[blockIndex];
  if (!block) return false;

  // Don't set alignment on void blocks
  const voidTypes = ['horizontal_rule', 'image'];
  if (voidTypes.includes(block.type)) return false;

  editor.dispatch({
    operations: [{
      type: 'update_attrs',
      path: [blockIndex],
      attrs: { textAlign: alignment === 'left' ? undefined : alignment },
    }],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

export const alignmentPlugin: PluginDefinition = {
  name: 'alignment',

  init(ctx) {
    ctx.commands.register('set-alignment', (editor, args) => {
      const alignment = (args?.alignment as Alignment) ?? 'left';
      return setAlignment(editor, alignment);
    });

    ctx.commands.register('align-left', (editor) => setAlignment(editor, 'left'));
    ctx.commands.register('align-center', (editor) => setAlignment(editor, 'center'));
    ctx.commands.register('align-right', (editor) => setAlignment(editor, 'right'));
    ctx.commands.register('align-justify', (editor) => setAlignment(editor, 'justify'));

    ctx.keymap.register('Mod-Shift-l', 'align-left');
    ctx.keymap.register('Mod-Shift-e', 'align-center');
    ctx.keymap.register('Mod-Shift-r', 'align-right');
    ctx.keymap.register('Mod-Shift-j', 'align-justify');
  },

  toolbarItems: [
    {
      name: 'align-left',
      icon: ICONS.alignLeft,
      title: 'Align Left (Ctrl+Shift+L)',
      command: 'align-left',
      isActive: (state) => getBlockAlignment(state) === 'left',
      order: 80,
    },
    {
      name: 'align-center',
      icon: ICONS.alignCenter,
      title: 'Align Center (Ctrl+Shift+E)',
      command: 'align-center',
      isActive: (state) => getBlockAlignment(state) === 'center',
      order: 81,
    },
    {
      name: 'align-right',
      icon: ICONS.alignRight,
      title: 'Align Right (Ctrl+Shift+R)',
      command: 'align-right',
      isActive: (state) => getBlockAlignment(state) === 'right',
      order: 82,
    },
    {
      name: 'align-justify',
      icon: ICONS.alignJustify,
      title: 'Justify (Ctrl+Shift+J)',
      command: 'align-justify',
      isActive: (state) => getBlockAlignment(state) === 'justify',
      order: 83,
    },
  ],
};
