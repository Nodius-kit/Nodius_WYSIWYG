import type { PluginDefinition, PluginContext, EditorInterface } from '../core/types';
import { ICONS } from '../assets/icons';

const CROP_CSS = `
.nodius-crop-overlay {
  position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;
  display:flex;align-items:center;justify-content:center;
}
.nodius-crop-modal {
  background:#fff;border-radius:12px;padding:1.5rem;max-width:90vw;max-height:90vh;
  display:flex;flex-direction:column;gap:1rem;box-shadow:0 8px 32px rgba(0,0,0,0.3);
}
.nodius-crop-canvas-wrapper {
  position:relative;display:inline-block;cursor:crosshair;
  overflow:hidden;max-width:80vw;max-height:60vh;
}
.nodius-crop-canvas-wrapper img { display:block;max-width:80vw;max-height:60vh; }
.nodius-crop-selection {
  position:absolute;border:2px dashed #3b82f6;background:rgba(59,130,246,0.1);
  pointer-events:none;
}
.nodius-crop-actions {
  display:flex;gap:0.75rem;justify-content:flex-end;
}
.nodius-crop-actions button {
  padding:0.5rem 1.25rem;border-radius:6px;border:1px solid #cbd5e1;
  cursor:pointer;font-size:0.875rem;
}
.nodius-crop-actions .crop-apply {
  background:#3b82f6;color:#fff;border-color:#3b82f6;
}
.nodius-crop-actions .crop-apply:hover { background:#2563eb; }
.nodius-crop-actions .crop-cancel:hover { background:#f1f5f9; }
`;

function injectCSS(): void {
  if (document.getElementById('nodius-crop-css')) return;
  const style = document.createElement('style');
  style.id = 'nodius-crop-css';
  style.textContent = CROP_CSS;
  document.head.appendChild(style);
}

export function createImageCropPlugin(): PluginDefinition {
  let editor: EditorInterface | null = null;
  let editableEl: HTMLElement | null = null;

  function getSelectedImageBlockIndex(): number | null {
    if (!editor) return null;
    const state = editor.getState();
    if (!state.selection) return null;
    const idx = state.selection.anchor.blockIndex;
    const block = state.doc.children[idx];
    if (block?.type === 'image') return idx;
    return null;
  }

  function openCropModal(imgSrc: string, blockIndex: number): void {
    if (!editor) return;
    injectCSS();

    const overlay = document.createElement('div');
    overlay.className = 'nodius-crop-overlay';

    const modal = document.createElement('div');
    modal.className = 'nodius-crop-modal';

    const wrapper = document.createElement('div');
    wrapper.className = 'nodius-crop-canvas-wrapper';

    const img = document.createElement('img');
    img.src = imgSrc;

    const selBox = document.createElement('div');
    selBox.className = 'nodius-crop-selection';
    selBox.style.display = 'none';

    wrapper.appendChild(img);
    wrapper.appendChild(selBox);

    const actions = document.createElement('div');
    actions.className = 'nodius-crop-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'crop-cancel';
    cancelBtn.textContent = 'Cancel';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'crop-apply';
    applyBtn.textContent = 'Apply Crop';

    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);

    modal.appendChild(wrapper);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Crop selection state
    let cropRect = { x: 0, y: 0, w: 0, h: 0 };
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    wrapper.addEventListener('mousedown', (e) => {
      const rect = wrapper.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      isDragging = true;
      selBox.style.display = 'block';
    });

    wrapper.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = wrapper.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      cropRect = {
        x: Math.min(startX, curX),
        y: Math.min(startY, curY),
        w: Math.abs(curX - startX),
        h: Math.abs(curY - startY),
      };

      selBox.style.left = cropRect.x + 'px';
      selBox.style.top = cropRect.y + 'px';
      selBox.style.width = cropRect.w + 'px';
      selBox.style.height = cropRect.h + 'px';
    });

    wrapper.addEventListener('mouseup', () => {
      isDragging = false;
    });

    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    applyBtn.addEventListener('click', () => {
      if (cropRect.w < 5 || cropRect.h < 5) {
        overlay.remove();
        return;
      }

      // Compute crop in natural image coordinates
      const displayW = img.offsetWidth;
      const displayH = img.offsetHeight;
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const scaleX = naturalW / displayW;
      const scaleY = naturalH / displayH;

      const sx = Math.round(cropRect.x * scaleX);
      const sy = Math.round(cropRect.y * scaleY);
      const sw = Math.round(cropRect.w * scaleX);
      const sh = Math.round(cropRect.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const newSrc = canvas.toDataURL('image/png');

      editor!.dispatch({
        operations: [{
          type: 'update_attrs',
          path: [blockIndex],
          attrs: { src: newSrc, width: sw, height: sh },
        }],
        origin: 'command',
        timestamp: Date.now(),
      });

      overlay.remove();
    });
  }

  function onDblClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'IMG' || !editableEl?.contains(target)) return;

    const blockEl = target.closest('[data-node-id]') ?? target;
    const blockIndex = Array.from(editableEl.children).indexOf(blockEl as Element);
    if (blockIndex === -1) return;

    const block = editor?.getDoc().children[blockIndex];
    if (block?.type !== 'image') return;

    openCropModal(String(block.attrs.src), blockIndex);
  }

  return {
    name: 'image-crop',
    dependencies: ['image-base64'],

    init(ctx: PluginContext) {
      editor = ctx.editor;
      editableEl = ctx.editor.getEditableElement();

      ctx.commands.register('crop-image', (ed) => {
        const idx = getSelectedImageBlockIndex();
        if (idx === null) return false;
        const block = ed.getDoc().children[idx];
        if (block?.type !== 'image') return false;
        openCropModal(String(block.attrs.src), idx);
        return true;
      });

      document.addEventListener('dblclick', onDblClick);

      return {
        destroy() {
          document.removeEventListener('dblclick', onDblClick);
          document.querySelector('.nodius-crop-overlay')?.remove();
        },
      };
    },

    toolbarItems: [{
      name: 'image-crop',
      icon: ICONS.crop,
      title: 'Crop Image',
      command: 'crop-image',
      isDisabled: (state) => {
        if (!state.selection) return true;
        return state.doc.children[state.selection.anchor.blockIndex]?.type !== 'image';
      },
      order: 64,
    }],
  };
}
