import type { PluginDefinition, Mark, ContentState } from '../core/types';
import { isMarkActive, getMarksAtPosition } from '../core/mark-utils';
import { toggleMarkOrStore } from '../core/mark-utils';
import { ICONS } from '../assets/icons';
import { createColorPicker, DEFAULT_COLORS } from '../ui/color-picker';

export interface HighlightConfig {
  colors?: string[];
}

export function createHighlightPlugin(config?: HighlightConfig): PluginDefinition {
  const colors = config?.colors ?? DEFAULT_COLORS;

  function getCurrentColor(state: ContentState): string | undefined {
    if (!state.selection) return undefined;
    const marks = state.storedMarks ?? getMarksAtPosition(state, state.selection.anchor);
    const m = marks.find((mk) => mk.type === 'highlight');
    return m?.attrs?.color as string | undefined;
  }

  return {
    name: 'highlight',

    markTypes: [{
      name: 'highlight',
      attrs: { color: { default: 'yellow' } },
      toDOM: (mark: Mark) => ['mark', {
        style: `background-color: ${String(mark.attrs?.color ?? 'yellow')}`,
      }],
      parseDOM: [{
        tag: 'mark',
        getAttrs: (dom: HTMLElement) => {
          const bg = dom.style.backgroundColor;
          return { color: bg || 'yellow' };
        },
      }],
    }],

    init(ctx) {
      ctx.commands.register('toggle-highlight', (editor, args) => {
        const color = args?.color as string | undefined;
        return toggleMarkOrStore(editor, 'highlight', color ? { color } : undefined);
      });
      ctx.keymap.register('Mod-Shift-h', 'toggle-highlight');
    },

    toolbarItems: [{
      name: 'highlight',
      icon: ICONS.highlight,
      title: 'Highlight (Ctrl+Shift+H)',
      command: 'toggle-highlight',
      isActive: (state) => isMarkActive(state, 'highlight'),
      order: 38,
      dropdown: (state: ContentState, anchorEl: HTMLElement, executeCommand) => {
        const current = getCurrentColor(state);
        return createColorPicker({
          colors,
          currentColor: current,
          anchorEl,
          onSelect: (color) => {
            executeCommand('toggle-highlight', { color });
          },
          onRemove: () => {
            executeCommand('toggle-highlight');
          },
        });
      },
    }],
  };
}

// Backwards compatibility
export const highlightPlugin: PluginDefinition = createHighlightPlugin();
