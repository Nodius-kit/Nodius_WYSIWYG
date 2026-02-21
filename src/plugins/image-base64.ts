import type { PluginDefinition, PluginContext, ElementNode, EditorInterface } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';
import { createModal } from '../ui/modal';

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

// ─── Dimensions Modal ───────────────────────────────────────

let dimCssInjected = false;

function injectDimCss(): void {
  if (dimCssInjected) return;
  dimCssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.nodius-dim-overlay {
  position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;
  display:flex;align-items:center;justify-content:center;
}
.nodius-dim-modal {
  background:#fff;border-radius:10px;padding:1.25rem 1.5rem 1rem;
  min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.2);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  display:flex;flex-direction:column;gap:0.75rem;
}
.nodius-dim-modal h3 {
  margin:0 0 0.25rem;font-size:0.9375rem;font-weight:600;color:#1e293b;
}
.nodius-dim-row {
  display:flex;align-items:center;gap:0.5rem;
}
.nodius-dim-row label {
  font-size:0.8125rem;color:#475569;font-weight:500;width:4.5rem;flex-shrink:0;
}
.nodius-dim-input {
  flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;
  font-size:0.875rem;outline:none;transition:border-color 0.15s;width:0;
}
.nodius-dim-input:focus { border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,0.15); }
.nodius-dim-unit { font-size:0.8125rem;color:#94a3b8; }
.nodius-dim-lock {
  display:flex;align-items:center;gap:0.35rem;font-size:0.8125rem;color:#475569;
  cursor:pointer;user-select:none;
}
.nodius-dim-lock input { cursor:pointer;accent-color:#3b82f6; }
.nodius-dim-select {
  flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;
  font-size:0.875rem;outline:none;background:#fff;cursor:pointer;
  transition:border-color 0.15s;
}
.nodius-dim-select:focus { border-color:#3b82f6; }
.nodius-dim-actions {
  display:flex;gap:0.5rem;justify-content:flex-end;padding-top:0.25rem;
}
.nodius-dim-actions button {
  padding:6px 16px;border-radius:6px;font-size:0.8125rem;font-weight:500;
  cursor:pointer;border:1px solid #e2e8f0;transition:background 0.15s;
}
.nodius-dim-cancel { background:#f1f5f9;color:#475569; }
.nodius-dim-cancel:hover { background:#e2e8f0; }
.nodius-dim-apply { background:#3b82f6;color:#fff;border-color:#3b82f6; }
.nodius-dim-apply:hover { background:#2563eb; }
`;
  document.head.appendChild(style);
}

function openImageDimensionsPanel(
  initW: number,
  initH: number,
  ratio: number,
  initAlign: string,
  onApply: (w: number, h: number, align: string) => void,
): void {
  injectDimCss();

  const overlay = document.createElement('div');
  overlay.className = 'nodius-dim-overlay';

  const modal = document.createElement('div');
  modal.className = 'nodius-dim-modal';

  const title = document.createElement('h3');
  title.textContent = 'Image Dimensions & Position';
  modal.appendChild(title);

  // Width row
  const wRow = document.createElement('div');
  wRow.className = 'nodius-dim-row';
  const wLabel = document.createElement('label');
  wLabel.textContent = 'Width';
  const wInput = document.createElement('input');
  wInput.className = 'nodius-dim-input';
  wInput.type = 'number';
  wInput.min = '10';
  wInput.value = String(Math.round(initW));
  const wUnit = document.createElement('span');
  wUnit.className = 'nodius-dim-unit';
  wUnit.textContent = 'px';
  wRow.append(wLabel, wInput, wUnit);
  modal.appendChild(wRow);

  // Height row
  const hRow = document.createElement('div');
  hRow.className = 'nodius-dim-row';
  const hLabel = document.createElement('label');
  hLabel.textContent = 'Height';
  const hInput = document.createElement('input');
  hInput.className = 'nodius-dim-input';
  hInput.type = 'number';
  hInput.min = '10';
  hInput.value = String(Math.round(initH));
  const hUnit = document.createElement('span');
  hUnit.className = 'nodius-dim-unit';
  hUnit.textContent = 'px';
  hRow.append(hLabel, hInput, hUnit);
  modal.appendChild(hRow);

  // Aspect ratio lock
  const lockRow = document.createElement('label');
  lockRow.className = 'nodius-dim-lock';
  const lockCheckbox = document.createElement('input');
  lockCheckbox.type = 'checkbox';
  lockCheckbox.checked = true;
  lockRow.append(lockCheckbox, document.createTextNode('Lock aspect ratio'));
  modal.appendChild(lockRow);

  // Alignment row
  const aRow = document.createElement('div');
  aRow.className = 'nodius-dim-row';
  const aLabel = document.createElement('label');
  aLabel.textContent = 'Alignment';
  const aSelect = document.createElement('select');
  aSelect.className = 'nodius-dim-select';
  for (const [val, lbl] of [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] as const) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = lbl;
    if (val === initAlign) opt.selected = true;
    aSelect.appendChild(opt);
  }
  aRow.append(aLabel, aSelect);
  modal.appendChild(aRow);

  // Aspect ratio linking
  let updating = false;
  wInput.addEventListener('input', () => {
    if (updating || !lockCheckbox.checked) return;
    const w = parseFloat(wInput.value);
    if (!Number.isFinite(w) || w <= 0) return;
    updating = true;
    hInput.value = String(Math.round(w / ratio));
    updating = false;
  });
  hInput.addEventListener('input', () => {
    if (updating || !lockCheckbox.checked) return;
    const h = parseFloat(hInput.value);
    if (!Number.isFinite(h) || h <= 0) return;
    updating = true;
    wInput.value = String(Math.round(h * ratio));
    updating = false;
  });

  // Buttons
  const actions = document.createElement('div');
  actions.className = 'nodius-dim-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'nodius-dim-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'nodius-dim-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.type = 'button';
  actions.append(cancelBtn, applyBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (): void => overlay.remove();

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  applyBtn.addEventListener('click', () => {
    const newW = Math.max(10, Math.round(parseFloat(wInput.value) || initW));
    const newH = Math.max(10, Math.round(parseFloat(hInput.value) || initH));
    close();
    onApply(newW, newH, aSelect.value);
  });

  requestAnimationFrame(() => { wInput.focus(); wInput.select(); });
}

// ─── Plugin Factory ─────────────────────────────────────────

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
        caption: { default: '' },
        width: { default: undefined as unknown },
        height: { default: undefined as unknown },
      },
      toDOM: (node) => {
        const style = getAlignStyle(node.attrs.align);
        const caption = String(node.attrs.caption ?? '');
        const imgAttrs: Record<string, string> = {
          src: String(node.attrs.src ?? ''),
          alt: String(node.attrs.alt ?? ''),
          ...(node.attrs.title ? { title: String(node.attrs.title) } : {}),
          ...(node.attrs.width != null ? { width: String(node.attrs.width) } : {}),
          ...(node.attrs.height != null ? { height: String(node.attrs.height) } : {}),
          style,
          'data-align': String(node.attrs.align ?? 'center'),
        };
        if (caption) {
          return ['figure', { style: 'text-align:center;margin:1em 0;', 'data-caption': caption },
            ['img', imgAttrs],
            ['figcaption', { style: 'font-size:0.875em;color:#64748b;margin-top:0.5em;' }, caption],
          ];
        }
        return ['img', imgAttrs];
      },
      parseDOM: [
        {
          tag: 'figure',
          getAttrs: (dom: HTMLElement) => {
            const img = dom.querySelector('img');
            if (!img) return false;
            const figcaption = dom.querySelector('figcaption');
            return {
              src: img.getAttribute('src') ?? '',
              alt: img.getAttribute('alt') ?? '',
              title: img.getAttribute('title') ?? '',
              align: img.getAttribute('data-align') ?? 'center',
              caption: figcaption?.textContent ?? '',
            };
          },
        },
        {
          tag: 'img[src]',
          getAttrs: (dom: HTMLElement) => ({
            src: dom.getAttribute('src') ?? '',
            alt: dom.getAttribute('alt') ?? '',
            title: dom.getAttribute('title') ?? '',
            align: dom.getAttribute('data-align') ?? 'center',
            caption: '',
          }),
        },
      ],
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

      ctx.commands.register('edit-image-caption', (editor) => {
        const idx = getSelectedImageIndex(editor);
        if (idx === null) return false;
        const block = editor.getDoc().children[idx];
        const currentCaption = String(block.attrs.caption ?? '');
        createModal({
          title: 'Edit Caption',
          fields: [{
            name: 'caption',
            label: 'Caption',
            type: 'text',
            value: currentCaption,
            placeholder: 'Image caption...',
          }],
          onSubmit: (values) => {
            editor.dispatch({
              operations: [{ type: 'update_attrs', path: [idx], attrs: { caption: values.caption } }],
              origin: 'command',
              timestamp: Date.now(),
            });
          },
        });
        return true;
      });

      ctx.commands.register('edit-image-dimensions', (editor) => {
        const idx = getSelectedImageIndex(editor);
        if (idx === null) return false;
        const block = editor.getDoc().children[idx];

        // Read current dimensions from the DOM img element for accuracy
        const editableEl = editor.getEditableElement();
        const blockEl = editableEl?.children[idx] as HTMLElement | undefined;
        const imgEl = (blockEl?.tagName === 'IMG' ? blockEl : blockEl?.querySelector('img')) as HTMLImageElement | null;

        const currentW = (imgEl?.offsetWidth ?? Number(block.attrs.width ?? 0)) || 300;
        const currentH = (imgEl?.offsetHeight ?? Number(block.attrs.height ?? 0)) || 200;
        const nativeRatio = currentW / (currentH || 1);

        openImageDimensionsPanel(
          currentW,
          currentH,
          nativeRatio,
          String(block.attrs.align ?? 'center'),
          (newW, newH, newAlign) => {
            editor.dispatch({
              operations: [{
                type: 'update_attrs',
                path: [idx],
                attrs: { width: newW, height: newH, align: newAlign },
              }],
              origin: 'command',
              timestamp: Date.now(),
            });
          },
        );
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

        // Allow dropping external files onto the editable area
        editableEl.addEventListener('dragover', (e: Event) => {
          const event = e as DragEvent;
          if (!event.dataTransfer) return;
          // Always prevent default so the browser doesn't try to navigate
          // or insert content itself. For file drops we use 'copy' effect;
          // for internal image drags we use 'none' to show the no-drop cursor.
          event.preventDefault();
          event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'none';
        });

        // Prevent the browser from drag-and-dropping image DOM nodes as text/html.
        // Without this, dragging a selected image inserts its base64 src as text
        // and desynchronises the editor state.
        editableEl.addEventListener('dragstart', (e: Event) => {
          const event = e as DragEvent;
          const target = event.target as HTMLElement;
          if (
            target.tagName === 'IMG' ||
            target.closest('[data-node-type="image"]')
          ) {
            event.preventDefault();
          }
        });

        // Handle drop with images
        editableEl.addEventListener('drop', async (e: Event) => {
          const event = e as DragEvent;
          // Always prevent default to stop browser inserting raw content
          event.preventDefault();
          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return;

          for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
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
