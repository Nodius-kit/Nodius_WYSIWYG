import type { PluginDefinition, PluginContext, PluginInstance } from '../core/types';

// ─── Pure helpers (exported for testing) ─────────────────────

/** Threshold in px before a mousedown is considered a drag. */
export const DRAG_THRESHOLD = 5;

/**
 * Given block midpoints (Y centres) and a cursor Y,
 * return the insertion slot (0 = before first block, N = after last).
 */
export function resolveDropSlot(
  blockMidpoints: readonly number[],
  cursorY: number,
): number {
  for (let i = 0; i < blockMidpoints.length; i++) {
    if (cursorY < blockMidpoints[i]) return i;
  }
  return blockMidpoints.length;
}

/**
 * Determine whether a drag from `sourceIndex` to `dropSlot` is a no-op.
 * A no-op is when the image would stay in the same position.
 */
export function isDragNoop(sourceIndex: number, dropSlot: number): boolean {
  // Dropping directly on or right after the source position = no change
  return dropSlot === sourceIndex || dropSlot === sourceIndex + 1;
}

/**
 * Compute the final document index after a move_node from sourceIndex
 * to dropSlot (raw slot). The engine adjusts toOffset internally.
 */
export function computeFinalIndex(sourceIndex: number, dropSlot: number): number {
  return dropSlot > sourceIndex ? dropSlot - 1 : dropSlot;
}

// ─── DOM helpers ─────────────────────────────────────────────

/**
 * Return only the actual document block elements from `editable.children`.
 * Filters out UI overlays (image-toolbar, floating-toolbar, etc.)
 * by requiring `data-node-id` attribute.
 */
function getDocBlocks(editable: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let i = 0; i < editable.children.length; i++) {
    const el = editable.children[i] as HTMLElement;
    if (el.hasAttribute('data-node-id')) result.push(el);
  }
  return result;
}

/** Walk up from target to find the image block element inside editable. */
function findImageBlockEl(target: HTMLElement, editable: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el !== editable) {
    if (el.parentElement === editable && el.hasAttribute('data-node-id')) {
      if (el.getAttribute('data-node-type') === 'image') return el;
      return null;
    }
    el = el.parentElement;
  }
  return null;
}

/** Get Y midpoints for all document blocks. */
function getBlockMidpoints(editable: HTMLElement): number[] {
  return getDocBlocks(editable).map((el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
}

// ─── CSS injection ───────────────────────────────────────────

let dragCssInjected = false;

function injectDragStyles(): void {
  if (dragCssInjected) return;
  dragCssInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-nodius-image-drag', '');
  style.textContent = `
.nodius-image-dragging {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
  border-radius: 4px;
}
`;
  document.head.appendChild(style);
}

// ─── Plugin ──────────────────────────────────────────────────

export function createImageDragPlugin(): PluginDefinition {
  return {
    name: 'image-drag',
    dependencies: ['image-base64'],

    init(ctx: PluginContext): PluginInstance {
      injectDragStyles();

      let editable: HTMLElement | null = null;
      let pending = false;       // mousedown captured, waiting for threshold
      let dragActive = false;    // threshold exceeded, drag in progress
      let startX = 0;
      let startY = 0;
      let draggedNodeId: string | null = null;  // stable ID of the dragged image

      /** Find the current document index of the dragged node by its ID in the DOM. */
      function findCurrentIndexInDOM(): number {
        if (!editable || !draggedNodeId) return -1;
        const blocks = getDocBlocks(editable);
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i].getAttribute('data-node-id') === draggedNodeId) return i;
        }
        return -1;
      }

      /** Verify the dragged node exists in the document state (not just DOM). */
      function nodeExistsInState(): boolean {
        if (!draggedNodeId) return false;
        const doc = ctx.editor.getDoc();
        return doc.children.some((c) => c.id === draggedNodeId);
      }

      function highlightDragged(): void {
        if (!editable || !draggedNodeId) return;
        const blocks = getDocBlocks(editable);
        for (const el of blocks) {
          if (el.getAttribute('data-node-id') === draggedNodeId) {
            el.classList.add('nodius-image-dragging');
          }
        }
      }

      function clearHighlight(): void {
        if (!editable) return;
        editable.querySelectorAll('.nodius-image-dragging')
          .forEach((el) => el.classList.remove('nodius-image-dragging'));
      }

      function reset(): void {
        if (dragActive) clearHighlight();
        pending = false;
        dragActive = false;
        draggedNodeId = null;
      }

      // ─── Event handlers ────────────────────────────────────

      function onMouseDown(e: MouseEvent): void {
        if (!editable || e.button !== 0) return;
        const target = e.target as HTMLElement;
        const blockEl = findImageBlockEl(target, editable);
        if (!blockEl) return;

        const nodeId = blockEl.getAttribute('data-node-id');
        if (!nodeId) return;

        // Don't preventDefault — allow normal clicks, image toolbar, etc.
        // Native drag is blocked by the dragstart handler below.
        pending = true;
        dragActive = false;
        startX = e.clientX;
        startY = e.clientY;
        draggedNodeId = nodeId;
      }

      function onMouseMove(e: MouseEvent): void {
        if (!pending && !dragActive) return;
        if (!editable) return;

        // Threshold check: don't start drag until mouse moves enough
        if (pending && !dragActive) {
          const dx = Math.abs(e.clientX - startX);
          const dy = Math.abs(e.clientY - startY);
          if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;

          // Verify the node still exists before starting drag
          if (!nodeExistsInState()) { reset(); return; }

          dragActive = true;
          pending = false;
          highlightDragged();
        }

        if (!dragActive) return;
        e.preventDefault(); // prevent text selection during drag

        // Find current position of the dragged node by its stable ID
        const currentIdx = findCurrentIndexInDOM();
        if (currentIdx === -1) { reset(); return; }

        // Verify state-DOM consistency
        if (!nodeExistsInState()) { reset(); return; }

        const midpoints = getBlockMidpoints(editable);
        const dropSlot = resolveDropSlot(midpoints, e.clientY);

        if (isDragNoop(currentIdx, dropSlot)) return;

        // Record child count before move to verify no duplication
        const childCountBefore = ctx.editor.getDoc().children.length;

        ctx.editor.dispatch({
          operations: [{
            type: 'move_node',
            path: [],
            offset: currentIdx,
            targetPath: [],
            data: dropSlot,
          }],
          origin: 'command',
          timestamp: Date.now(),
        });

        // Safety: verify no duplication occurred
        const childCountAfter = ctx.editor.getDoc().children.length;
        if (childCountAfter !== childCountBefore) {
          // Something went wrong — abort drag
          reset();
          return;
        }

        // Re-highlight after DOM reconcile (synchronous)
        highlightDragged();
      }

      function onMouseUp(): void {
        reset();
      }

      /**
       * Prevent native HTML5 drag on images.
       * Without this, the browser intercepts mousedown on images, fires
       * drag/dragend events (not mousemove/mouseup), and moves the DOM
       * element outside our state management — causing duplication.
       */
      function onDragStart(e: Event): void {
        const event = e as DragEvent;
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'IMG' ||
          target.closest('[data-node-type="image"]')
        ) {
          event.preventDefault();
        }
      }

      /**
       * Safety net: if a native drag somehow starts (e.g. browser quirk),
       * reset our state when it ends so we don't get stuck in pending mode.
       */
      function onDragEnd(): void {
        if (pending || dragActive) {
          reset();
        }
      }

      // ─── Lifecycle ─────────────────────────────────────────

      function attach(): void {
        editable = ctx.editor.getEditableElement();
        if (!editable) return;
        editable.addEventListener('mousedown', onMouseDown);
        editable.addEventListener('dragstart', onDragStart);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('dragend', onDragEnd);
      }

      function detach(): void {
        if (editable) {
          editable.removeEventListener('mousedown', onMouseDown);
          editable.removeEventListener('dragstart', onDragStart);
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('dragend', onDragEnd);
      }

      const unsubMount = ctx.editor.on('mount', () => attach());
      attach();

      return {
        destroy() {
          unsubMount();
          detach();
          clearHighlight();
        },
      };
    },
  };
}
