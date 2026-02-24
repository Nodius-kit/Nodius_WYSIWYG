import type { PluginDefinition, Mark, ContentState } from '../core/types';
import { isMarkActive, selectionHasMark, getMarksAtPosition } from '../core/mark-utils';
import { ICONS } from '../assets/icons';
import { createColorPicker, DEFAULT_COLORS } from '../ui/color-picker';

export interface TextColorConfig {
  colors?: string[];
}

export function createTextColorPlugin(config?: TextColorConfig): PluginDefinition {
  const colors = config?.colors ?? DEFAULT_COLORS;

  function getCurrentColor(state: ContentState): string | undefined {
    if (!state.selection) return undefined;
    const marks = state.storedMarks ?? getMarksAtPosition(state, state.selection.anchor);
    const m = marks.find((mk) => mk.type === 'text-color');
    return m?.attrs?.color as string | undefined;
  }

  return {
    name: 'text-color',

    markTypes: [{
      name: 'text-color',
      attrs: { color: { default: '#000000' } },
      toDOM: (mark: Mark) => ['span', {
        style: `color: ${String(mark.attrs?.color ?? '#000000')}`,
      }],
      parseDOM: [{
        tag: 'span[style]',
        getAttrs: (dom: HTMLElement) => {
          const color = dom.style.color;
          if (!color) return false;
          return { color };
        },
      }],
    }],

    init(ctx) {
      ctx.commands.register('set-text-color', (editor, args) => {
        const color = args?.color as string | undefined;
        if (!color) return false;
        const state = editor.getState();
        if (!state.selection) return false;

        const { anchor, focus } = state.selection;
        if (anchor.blockIndex !== focus.blockIndex) return false;

        const from = Math.min(anchor.offset, focus.offset);
        const to = Math.max(anchor.offset, focus.offset);
        const mark: Mark = { type: 'text-color', attrs: { color } };

        if (from === to) {
          const current = state.storedMarks ?? getMarksAtPosition(state, anchor);
          const filtered = current.filter((m) => m.type !== 'text-color');
          editor.dispatch({
            operations: [],
            storedMarks: [...filtered, mark],
            origin: 'command',
            timestamp: Date.now(),
          });
          return true;
        }

        const ops = [];
        if (selectionHasMark(state, 'text-color')) {
          ops.push({
            type: 'remove_mark' as const,
            path: [anchor.blockIndex],
            offset: from,
            length: to - from,
            mark: { type: 'text-color' } as Mark,
          });
        }
        ops.push({
          type: 'add_mark' as const,
          path: [anchor.blockIndex],
          offset: from,
          length: to - from,
          mark,
        });
        editor.dispatch({
          operations: ops,
          origin: 'command',
          timestamp: Date.now(),
        });
        return true;
      });

      ctx.commands.register('remove-text-color', (editor) => {
        const state = editor.getState();
        if (!state.selection) return false;

        const { anchor, focus } = state.selection;
        if (anchor.blockIndex !== focus.blockIndex) return false;

        const from = Math.min(anchor.offset, focus.offset);
        const to = Math.max(anchor.offset, focus.offset);

        if (from === to) {
          const current = state.storedMarks ?? getMarksAtPosition(state, anchor);
          editor.dispatch({
            operations: [],
            storedMarks: current.filter((m) => m.type !== 'text-color'),
            origin: 'command',
            timestamp: Date.now(),
          });
          return true;
        }

        editor.dispatch({
          operations: [{
            type: 'remove_mark',
            path: [anchor.blockIndex],
            offset: from,
            length: to - from,
            mark: { type: 'text-color' },
          }],
          origin: 'command',
          timestamp: Date.now(),
        });
        return true;
      });
    },

    toolbarItems: [{
      name: 'text-color',
      icon: ICONS.textColor,
      title: 'Text Color',
      command: 'set-text-color',
      isActive: (state) => isMarkActive(state, 'text-color'),
      order: 39,
      dropdown: (state: ContentState, anchorEl: HTMLElement, executeCommand) => {
        const current = getCurrentColor(state);
        return createColorPicker({
          colors,
          currentColor: current,
          anchorEl,
          onSelect: (color) => {
            executeCommand('set-text-color', { color });
          },
          onRemove: () => {
            executeCommand('remove-text-color');
          },
        });
      },
    }],
  };
}
