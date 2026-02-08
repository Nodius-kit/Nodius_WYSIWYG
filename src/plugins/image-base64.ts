import type { PluginDefinition, PluginContext, ElementNode, EditorInterface } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';

function createImageNode(src: string, alt: string = '', width?: number, height?: number): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'image',
    attrs: { src, alt, align: 'center', ...(width != null ? { width } : {}), ...(height != null ? { height } : {}) },
    children: [],
  };
}

function insertImageAfterCurrent(editor: EditorInterface, src: string, alt?: string): boolean {
  const state = editor.getState();
  const blockIndex = state.selection?.anchor.blockIndex ?? state.doc.children.length - 1;
  const imageNode = createImageNode(src, alt ?? '');

  editor.dispatch({
    operations: [
      { type: 'insert_node', path: [], offset: blockIndex + 1, data: imageNode },
    ],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getSelectedImageIndex(editor: EditorInterface): number | null {
  const state = editor.getState();
  if (!state.selection) return null;
  const blockIndex = state.selection.anchor.blockIndex;
  const block = state.doc.children[blockIndex];
  if (block?.type === 'image') return blockIndex;
  return null;
}

function setImageAlign(editor: EditorInterface, align: string): boolean {
  const idx = getSelectedImageIndex(editor);
  if (idx === null) return false;
  editor.dispatch({
    operations: [{ type: 'update_attrs', path: [idx], attrs: { align } }],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

function getAlignStyle(align: unknown): string {
  switch (align) {
    case 'left': return 'float:left;margin-right:1em;';
    case 'right': return 'float:right;margin-left:1em;';
    default: return 'display:block;margin-left:auto;margin-right:auto;';
  }
}

export function createImageBase64Plugin(): PluginDefinition {
  return {
    name: 'image-base64',

    nodeTypes: [{
      name: 'image',
      group: 'void',
      attrs: {
        src: { default: '' },
        alt: { default: '' },
        title: { default: '' },
        align: { default: 'center' },
        width: { default: undefined as unknown },
        height: { default: undefined as unknown },
      },
      toDOM: (node) => {
        const style = getAlignStyle(node.attrs.align);
        return ['img', {
          src: String(node.attrs.src ?? ''),
          alt: String(node.attrs.alt ?? ''),
          ...(node.attrs.title ? { title: String(node.attrs.title) } : {}),
          ...(node.attrs.width != null ? { width: String(node.attrs.width) } : {}),
          ...(node.attrs.height != null ? { height: String(node.attrs.height) } : {}),
          style,
          'data-align': String(node.attrs.align ?? 'center'),
        }];
      },
      parseDOM: [{
        tag: 'img[src]',
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute('src') ?? '',
          alt: dom.getAttribute('alt') ?? '',
          title: dom.getAttribute('title') ?? '',
          align: dom.getAttribute('data-align') ?? 'center',
        }),
      }],
    }],

    init(ctx: PluginContext) {
      ctx.commands.register('insert-image-base64', (editor) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const dataUrl = await readFileAsBase64(file);
          insertImageAfterCurrent(editor, dataUrl, file.name);
        };
        input.click();
        return true;
      });

      ctx.commands.register('set-image-align-left', (editor) => setImageAlign(editor, 'left'));
      ctx.commands.register('set-image-align-center', (editor) => setImageAlign(editor, 'center'));
      ctx.commands.register('set-image-align-right', (editor) => setImageAlign(editor, 'right'));

      ctx.commands.register('edit-image-alt', (editor) => {
        const idx = getSelectedImageIndex(editor);
        if (idx === null) return false;
        const block = editor.getDoc().children[idx];
        const currentAlt = String(block.attrs.alt ?? '');
        const newAlt = prompt('Alt text:', currentAlt);
        if (newAlt === null) return false;
        editor.dispatch({
          operations: [{ type: 'update_attrs', path: [idx], attrs: { alt: newAlt } }],
          origin: 'command',
          timestamp: Date.now(),
        });
        return true;
      });

      // Handle paste with images
      const editableEl = ctx.editor.getEditableElement();
      if (editableEl) {
        editableEl.addEventListener('paste', async (e: Event) => {
          const event = e as ClipboardEvent;
          const items = event.clipboardData?.items;
          if (!items) return;

          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const dataUrl = await readFileAsBase64(file);
              insertImageAfterCurrent(ctx.editor, dataUrl, 'pasted-image');
              return;
            }
          }
        });

        // Handle drop with images
        editableEl.addEventListener('drop', async (e: Event) => {
          const event = e as DragEvent;
          const files = event.dataTransfer?.files;
          if (!files) return;

          for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              const dataUrl = await readFileAsBase64(file);
              insertImageAfterCurrent(ctx.editor, dataUrl, file.name);
              return;
            }
          }
        });
      }
    },

    toolbarItems: [
      {
        name: 'image',
        icon: ICONS.image,
        title: 'Insert Image',
        command: 'insert-image-base64',
        order: 60,
      },
      {
        name: 'image-align-left',
        icon: ICONS.alignLeft,
        title: 'Align Image Left',
        command: 'set-image-align-left',
        isActive: (state) => {
          if (!state.selection) return false;
          const block = state.doc.children[state.selection.anchor.blockIndex];
          return block?.type === 'image' && block.attrs.align === 'left';
        },
        isDisabled: (state) => {
          if (!state.selection) return true;
          return state.doc.children[state.selection.anchor.blockIndex]?.type !== 'image';
        },
        order: 61,
      },
      {
        name: 'image-align-center',
        icon: ICONS.alignCenter,
        title: 'Align Image Center',
        command: 'set-image-align-center',
        isActive: (state) => {
          if (!state.selection) return false;
          const block = state.doc.children[state.selection.anchor.blockIndex];
          return block?.type === 'image' && (block.attrs.align === 'center' || !block.attrs.align);
        },
        isDisabled: (state) => {
          if (!state.selection) return true;
          return state.doc.children[state.selection.anchor.blockIndex]?.type !== 'image';
        },
        order: 62,
      },
      {
        name: 'image-align-right',
        icon: ICONS.alignRight,
        title: 'Align Image Right',
        command: 'set-image-align-right',
        isActive: (state) => {
          if (!state.selection) return false;
          const block = state.doc.children[state.selection.anchor.blockIndex];
          return block?.type === 'image' && block.attrs.align === 'right';
        },
        isDisabled: (state) => {
          if (!state.selection) return true;
          return state.doc.children[state.selection.anchor.blockIndex]?.type !== 'image';
        },
        order: 63,
      },
    ],
  };
}
