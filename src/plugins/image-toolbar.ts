import type { PluginDefinition, PluginContext, EditorInterface } from '../core/types';
import { ICONS } from '../assets/icons';

let styleInjected = false;

function injectStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.nodius-image-toolbar {
  position: absolute;
  display: flex;
  gap: 2px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 4px;
  z-index: 100;
  animation: nodius-img-tb-in 0.12s ease-out;
}
@keyframes nodius-img-tb-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.nodius-image-toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
  padding: 0;
  transition: background 0.1s, color 0.1s;
}
.nodius-image-toolbar button:hover {
  background: #f1f5f9;
  color: #1e293b;
}
.nodius-image-toolbar button.active {
  background: #e0e7ff;
  color: #3b82f6;
}
.nodius-image-toolbar .separator {
  width: 1px;
  background: #e2e8f0;
  margin: 2px 3px;
}
`;
  document.head.appendChild(style);
}

interface ToolbarButton {
  icon: string;
  title: string;
  command: string;
  isActive?: (editor: EditorInterface) => boolean;
}

export function createImageToolbarPlugin(): PluginDefinition {
  let toolbarEl: HTMLElement | null = null;
  let currentEditor: EditorInterface | null = null;
  let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  function destroyToolbar(): void {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
    if (clickOutsideHandler) {
      document.removeEventListener('mousedown', clickOutsideHandler, true);
      clickOutsideHandler = null;
    }
  }

  function showToolbar(imgEl: HTMLElement, editor: EditorInterface): void {
    destroyToolbar();
    injectStyles();

    const state = editor.getState();
    if (!state.selection) return;
    const blockIndex = state.selection.anchor.blockIndex;
    const block = state.doc.children[blockIndex];
    if (!block || block.type !== 'image') return;

    toolbarEl = document.createElement('div');
    toolbarEl.className = 'nodius-image-toolbar';

    const icons = ICONS as Record<string, string>;
    const buttons: (ToolbarButton | 'separator')[] = [
      { icon: ICONS.alignLeft, title: 'Align Left', command: 'set-image-align-left',
        isActive: () => block.attrs.align === 'left' },
      { icon: ICONS.alignCenter, title: 'Align Center', command: 'set-image-align-center',
        isActive: () => block.attrs.align === 'center' || !block.attrs.align },
      { icon: ICONS.alignRight, title: 'Align Right', command: 'set-image-align-right',
        isActive: () => block.attrs.align === 'right' },
      'separator',
      { icon: icons['dimensions'] ?? ICONS.image, title: 'Edit Dimensions & Position', command: 'edit-image-dimensions' },
      { icon: ICONS.caption, title: 'Edit Caption', command: 'edit-image-caption' },
      { icon: ICONS.crop, title: 'Crop', command: 'crop-image' },
      'separator',
      { icon: ICONS.trash, title: 'Delete Image', command: 'delete-image' },
    ];

    for (const btn of buttons) {
      if (btn === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'separator';
        toolbarEl.appendChild(sep);
        continue;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = btn.icon;
      button.title = btn.title;
      if (btn.isActive?.(editor)) {
        button.classList.add('active');
      }
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editor.executeCommand(btn.command);
        // Refresh toolbar state after command
        destroyToolbar();
      });
      toolbarEl.appendChild(button);
    }

    // Position below the image
    const editable = editor.getEditableElement();
    if (!editable) return;
    const editableRect = editable.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();

    toolbarEl.style.left = `${imgRect.left - editableRect.left + (imgRect.width / 2)}px`;
    toolbarEl.style.top = `${imgRect.bottom - editableRect.top + 8}px`;
    toolbarEl.style.transform = 'translateX(-50%)';

    editable.style.position = 'relative';
    editable.appendChild(toolbarEl);

    // Dismiss on click outside
    clickOutsideHandler = (e: MouseEvent) => {
      if (toolbarEl && !toolbarEl.contains(e.target as Node)) {
        destroyToolbar();
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', clickOutsideHandler!, true);
    }, 0);
  }

  return {
    name: 'image-toolbar',
    dependencies: ['image-base64'],

    init(ctx: PluginContext) {
      currentEditor = ctx.editor;

      // Register delete-image command
      ctx.commands.register('delete-image', (editor) => {
        const state = editor.getState();
        if (!state.selection) return false;
        const blockIndex = state.selection.anchor.blockIndex;
        const block = state.doc.children[blockIndex];
        if (!block || block.type !== 'image') return false;

        editor.dispatch({
          operations: [{ type: 'delete_node', path: [], offset: blockIndex }],
          selection: {
            anchor: { blockIndex: Math.max(0, blockIndex - 1), path: [], offset: 0 },
            focus: { blockIndex: Math.max(0, blockIndex - 1), path: [], offset: 0 },
          },
          origin: 'command',
          timestamp: Date.now(),
        });
        return true;
      });

      const editable = ctx.editor.getEditableElement();
      if (editable) {
        editable.addEventListener('click', (e: Event) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG' && target.closest('[data-node-id]')) {
            const blockEl = target.closest('[data-node-id]') as HTMLElement;
            if (blockEl?.parentElement === editable) {
              // Set selection to the image block
              const blocks = Array.from(editable.children);
              const blockIndex = blocks.indexOf(blockEl);
              if (blockIndex >= 0) {
                ctx.editor.dispatch({
                  operations: [],
                  selection: {
                    anchor: { blockIndex, path: [], offset: 0 },
                    focus: { blockIndex, path: [], offset: 0 },
                  },
                  origin: 'command',
                  timestamp: Date.now(),
                });
                showToolbar(target, ctx.editor);
              }
            }
          }
        });
      }
    },

    destroy() {
      destroyToolbar();
      currentEditor = null;
    },
  };
}
