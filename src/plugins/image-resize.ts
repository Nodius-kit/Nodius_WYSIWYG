import type { PluginDefinition, PluginContext, EditorInterface } from '../core/types';

export function createImageResizePlugin(): PluginDefinition {
  let editableEl: HTMLElement | null = null;
  let editor: EditorInterface | null = null;
  let activeHandles: HTMLElement[] = [];
  let activeImage: HTMLElement | null = null;

  function clearHandles(): void {
    for (const h of activeHandles) h.remove();
    activeHandles = [];
    activeImage = null;
  }

  function createHandle(cursor: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'nodius-resize-handle';
    h.style.cssText = `
      position:absolute;width:10px;height:10px;background:#3b82f6;
      border:1px solid #fff;border-radius:2px;cursor:${cursor};z-index:100;
    `;
    return h;
  }

  function positionHandles(img: HTMLElement): void {
    const rect = img.getBoundingClientRect();
    const parentRect = img.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const ox = rect.left - parentRect.left;
    const oy = rect.top - parentRect.top;

    const positions = [
      { x: ox - 5, y: oy - 5, cursor: 'nw-resize' },
      { x: ox + rect.width - 5, y: oy - 5, cursor: 'ne-resize' },
      { x: ox - 5, y: oy + rect.height - 5, cursor: 'sw-resize' },
      { x: ox + rect.width - 5, y: oy + rect.height - 5, cursor: 'se-resize' },
    ];

    for (let i = 0; i < 4; i++) {
      const h = activeHandles[i];
      if (!h) continue;
      h.style.left = positions[i].x + 'px';
      h.style.top = positions[i].y + 'px';
    }
  }

  function showHandles(img: HTMLElement): void {
    clearHandles();
    activeImage = img;

    // Ensure offset parent has position
    const parent = img.offsetParent as HTMLElement | null;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize'];
    for (let i = 0; i < 4; i++) {
      const h = createHandle(cursors[i]);
      (parent ?? document.body).appendChild(h);
      activeHandles.push(h);
      attachDrag(h, img, i);
    }
    positionHandles(img);
  }

  function attachDrag(handle: HTMLElement, img: HTMLElement, corner: number): void {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startW = img.offsetWidth;
      const startH = img.offsetHeight;
      const ratio = startW / (startH || 1);

      // Corners: 0=NW, 1=NE, 2=SW, 3=SE
      // Left-side handles (NW, SW) grow when cursor moves left → invert dx
      const isLeftHandle = corner === 0 || corner === 2;

      function onMove(ev: MouseEvent): void {
        ev.preventDefault();
        // Use horizontal delta only: no dx/dy comparison that causes jumps
        const rawDx = ev.clientX - startX;
        const dx = isLeftHandle ? -rawDx : rawDx;
        const newW = Math.max(50, startW + dx);
        const newH = Math.round(newW / ratio);

        img.style.width = newW + 'px';
        img.style.height = newH + 'px';
        img.setAttribute('width', String(Math.round(newW)));
        img.setAttribute('height', String(newH));
        positionHandles(img);
      }

      function onUp(): void {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (!editor || !editableEl) return;
        const blockEl = img.closest('[data-node-id]') ?? img;
        const blockIndex = Array.from(editableEl.children).indexOf(blockEl as Element);
        if (blockIndex === -1) return;

        editor.dispatch({
          operations: [{
            type: 'update_attrs',
            path: [blockIndex],
            attrs: {
              width: parseInt(img.getAttribute('width') ?? String(img.offsetWidth), 10),
              height: parseInt(img.getAttribute('height') ?? String(img.offsetHeight), 10),
            },
          }],
          origin: 'command',
          timestamp: Date.now(),
        });
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function onClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' && target.closest('.nodius-editable')) {
      showHandles(target);
    } else if (!target.classList.contains('nodius-resize-handle')) {
      clearHandles();
    }
  }

  return {
    name: 'image-resize',
    dependencies: ['image-base64'],

    init(ctx: PluginContext) {
      editor = ctx.editor;
      editableEl = ctx.editor.getEditableElement();

      document.addEventListener('click', onClick);

      // Clear handles when the active image is removed from the DOM
      // (e.g. deleted via toolbar — the click event on the detached button won't propagate)
      const unsubscribe = ctx.editor.on('state:change', () => {
        if (activeImage && !activeImage.isConnected) {
          clearHandles();
        }
      });

      return {
        destroy() {
          clearHandles();
          document.removeEventListener('click', onClick);
          unsubscribe();
        },
      };
    },
  };
}
