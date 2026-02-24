import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { baseStylesPlugin } from '../../src/plugins/base-styles';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import {
  createImageDragPlugin,
  resolveDropSlot,
  isDragNoop,
  computeFinalIndex,
  DRAG_THRESHOLD,
} from '../../src/plugins/image-drag';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode } from '../../src/core/types';

// ─── Helpers ─────────────────────────────────────────────────

function makeDoc(blocks: Array<{ type: string; text?: string }>): Document {
  return {
    id: generateId(),
    kind: 'document',
    version: 0,
    children: blocks.map((b) => {
      if (b.type === 'image') {
        return {
          id: generateId(), kind: 'element' as const, type: 'image',
          attrs: { src: 'data:image/png;base64,abc', alt: '' },
          children: [],
        };
      }
      return {
        id: generateId(), kind: 'element' as const, type: 'paragraph',
        attrs: {},
        children: [{ id: generateId(), kind: 'text' as const, text: b.text ?? '', marks: [] as const }],
      };
    }),
  };
}

function mountEditor(doc: Document): { editor: ReturnType<typeof createEditor>; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = createEditor({
    plugins: [baseStylesPlugin, createImageBase64Plugin(), createImageDragPlugin()],
    initialContent: doc,
  });
  editor.mount(container);
  return { editor, container };
}

function cleanup(editor: ReturnType<typeof createEditor>, container: HTMLElement): void {
  editor.destroy();
  document.body.removeChild(container);
}

// ─── Base Styles Plugin ──────────────────────────────────────

describe('Base Styles Plugin', () => {
  beforeEach(() => {
    document.querySelectorAll('style[data-nodius-base]').forEach((el) => el.remove());
  });

  it('should have name "base-styles"', () => {
    expect(baseStylesPlugin.name).toBe('base-styles');
  });

  it('should inject base CSS on init', () => {
    const { editor, container } = mountEditor(makeDoc([{ type: 'paragraph', text: 'Hi' }]));
    const style = document.querySelector('style[data-nodius-base]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('.nodius-editor');
    expect(style!.textContent).toContain('.nodius-editable');
    cleanup(editor, container);
  });

  it('should include flow-root for float containment', () => {
    const { editor, container } = mountEditor(makeDoc([{ type: 'paragraph', text: 'Hi' }]));
    const style = document.querySelector('style[data-nodius-base]');
    expect(style!.textContent).toContain('display: flow-root');
    cleanup(editor, container);
  });

  it('should not inject CSS twice (idempotent)', () => {
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    document.body.appendChild(c1);
    document.body.appendChild(c2);
    const e1 = createEditor({ plugins: [baseStylesPlugin] });
    e1.mount(c1);
    const e2 = createEditor({ plugins: [baseStylesPlugin] });
    e2.mount(c2);
    expect(document.querySelectorAll('style[data-nodius-base]').length).toBe(1);
    e1.destroy(); e2.destroy();
    document.body.removeChild(c1); document.body.removeChild(c2);
  });
});

// ─── Image Alignment CSS ─────────────────────────────────────

describe('Image Alignment CSS', () => {
  function getStyle(align: string, caption?: string) {
    const plugin = createImageBase64Plugin();
    const node: ElementNode = {
      id: generateId(), kind: 'element', type: 'image',
      attrs: { src: 'test.png', alt: '', align, ...(caption ? { caption } : {}) },
      children: [],
    };
    return plugin.nodeTypes![0].toDOM!(node) as any[];
  }

  it('left-aligned: float + max-width:50%', () => {
    const spec = getStyle('left');
    expect(spec[1].style).toContain('float:left');
    expect(spec[1].style).toContain('max-width:50%');
  });

  it('right-aligned: float + max-width:50%', () => {
    const spec = getStyle('right');
    expect(spec[1].style).toContain('float:right');
    expect(spec[1].style).toContain('max-width:50%');
  });

  it('center-aligned: no float, display block + auto margins', () => {
    const spec = getStyle('center');
    expect(spec[1].style).toContain('display:block');
    expect(spec[1].style).toContain('margin-left:auto');
    expect(spec[1].style).not.toContain('float');
  });

  it('captioned left: float on figure, width:100% on inner img', () => {
    const spec = getStyle('left', 'My caption');
    expect(spec[0]).toBe('figure');
    expect(spec[1].style).toContain('float:left');
    expect(spec[2][1].style).toContain('width:100%');
  });

  it('captioned center: no float on figure', () => {
    const spec = getStyle('center', 'My caption');
    expect(spec[0]).toBe('figure');
    expect(spec[1].style).toContain('text-align:center');
    expect(spec[1].style).not.toContain('float');
  });
});

// ─── Image Drag — Pure function tests ────────────────────────

describe('Image Drag: resolveDropSlot', () => {
  it('returns 0 when cursor is above all blocks', () => {
    expect(resolveDropSlot([100, 200, 300], 50)).toBe(0);
  });

  it('returns N when cursor is below all blocks', () => {
    expect(resolveDropSlot([100, 200, 300], 350)).toBe(3);
  });

  it('returns correct slot between blocks', () => {
    expect(resolveDropSlot([100, 200, 300], 150)).toBe(1);
    expect(resolveDropSlot([100, 200, 300], 250)).toBe(2);
  });

  it('returns 0 for empty document', () => {
    expect(resolveDropSlot([], 100)).toBe(0);
  });

  it('returns slot just before a block when cursor equals midpoint', () => {
    // When cursorY === midpoint, the comparison < fails, so it goes to next slot
    expect(resolveDropSlot([100, 200, 300], 200)).toBe(2);
  });
});

describe('Image Drag: isDragNoop', () => {
  it('dropping at same position is noop', () => {
    expect(isDragNoop(1, 1)).toBe(true);
  });

  it('dropping right after source is noop', () => {
    expect(isDragNoop(1, 2)).toBe(true);
  });

  it('dropping before source is NOT noop', () => {
    expect(isDragNoop(2, 1)).toBe(false);
  });

  it('dropping 2+ positions after source is NOT noop', () => {
    expect(isDragNoop(0, 2)).toBe(false);
  });
});

describe('Image Drag: computeFinalIndex', () => {
  it('moving down: finalIndex = dropSlot - 1', () => {
    expect(computeFinalIndex(0, 3)).toBe(2);
    expect(computeFinalIndex(1, 4)).toBe(3);
  });

  it('moving up: finalIndex = dropSlot', () => {
    expect(computeFinalIndex(3, 0)).toBe(0);
    expect(computeFinalIndex(2, 1)).toBe(1);
  });
});

describe('Image Drag: DRAG_THRESHOLD', () => {
  it('should be 5 pixels', () => {
    expect(DRAG_THRESHOLD).toBe(5);
  });
});

// ─── Image Drag — Integration tests ─────────────────────────

describe('Image Drag Plugin', () => {
  it('should have correct name and dependency', () => {
    const plugin = createImageDragPlugin();
    expect(plugin.name).toBe('image-drag');
    expect(plugin.dependencies).toContain('image-base64');
  });

  it('should init and destroy without errors', () => {
    const doc = makeDoc([{ type: 'image' }, { type: 'paragraph', text: 'Hello' }]);
    const { editor, container } = mountEditor(doc);
    editor.destroy();
    document.body.removeChild(container);
  });

  it('move_node: image from start to end (2 blocks)', () => {
    const doc = makeDoc([{ type: 'image' }, { type: 'paragraph', text: 'P1' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 0, targetPath: [], data: 2 }],
      origin: 'command', timestamp: Date.now(),
    });

    expect(editor.getState().doc.children[0].type).toBe('paragraph');
    expect(editor.getState().doc.children[1].type).toBe('image');
    expect(editor.getState().doc.children.length).toBe(2); // no duplication
    cleanup(editor, container);
  });

  it('move_node: image from start to end (3 blocks)', () => {
    const doc = makeDoc([{ type: 'image' }, { type: 'paragraph', text: 'P1' }, { type: 'paragraph', text: 'P2' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 0, targetPath: [], data: 3 }],
      origin: 'command', timestamp: Date.now(),
    });

    const s = editor.getState();
    expect(s.doc.children[0].type).toBe('paragraph');
    expect(s.doc.children[1].type).toBe('paragraph');
    expect(s.doc.children[2].type).toBe('image');
    expect(s.doc.children.length).toBe(3); // no duplication
    cleanup(editor, container);
  });

  it('move_node: image from end to start (3 blocks)', () => {
    const doc = makeDoc([{ type: 'paragraph', text: 'P1' }, { type: 'paragraph', text: 'P2' }, { type: 'image' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 2, targetPath: [], data: 0 }],
      origin: 'command', timestamp: Date.now(),
    });

    const s = editor.getState();
    expect(s.doc.children[0].type).toBe('image');
    expect(s.doc.children[1].type).toBe('paragraph');
    expect(s.doc.children[2].type).toBe('paragraph');
    expect(s.doc.children.length).toBe(3); // no duplication
    cleanup(editor, container);
  });

  it('move_node: image from middle to start', () => {
    const doc = makeDoc([{ type: 'paragraph', text: 'P1' }, { type: 'image' }, { type: 'paragraph', text: 'P2' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 1, targetPath: [], data: 0 }],
      origin: 'command', timestamp: Date.now(),
    });

    const s = editor.getState();
    expect(s.doc.children[0].type).toBe('image');
    expect(s.doc.children[1].type).toBe('paragraph');
    expect(s.doc.children[2].type).toBe('paragraph');
    expect(s.doc.children.length).toBe(3);
    cleanup(editor, container);
  });

  it('sequential moves preserve node count (stress)', () => {
    const doc = makeDoc([
      { type: 'paragraph', text: 'A' },
      { type: 'image' },
      { type: 'paragraph', text: 'B' },
      { type: 'paragraph', text: 'C' },
    ]);
    const { editor, container } = mountEditor(doc);

    // Move image from 1 to end (slot 4)
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 1, targetPath: [], data: 4 }],
      origin: 'command', timestamp: Date.now(),
    });
    expect(editor.getState().doc.children.length).toBe(4);
    expect(editor.getState().doc.children[3].type).toBe('image');

    // Move it back to slot 0
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 3, targetPath: [], data: 0 }],
      origin: 'command', timestamp: Date.now(),
    });
    expect(editor.getState().doc.children.length).toBe(4);
    expect(editor.getState().doc.children[0].type).toBe('image');

    // Move to middle (slot 2)
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 0, targetPath: [], data: 2 }],
      origin: 'command', timestamp: Date.now(),
    });
    expect(editor.getState().doc.children.length).toBe(4);
    expect(editor.getState().doc.children[1].type).toBe('image');

    cleanup(editor, container);
  });

  it('node ID is preserved after move', () => {
    const imgId = generateId();
    const doc: Document = {
      id: generateId(), kind: 'document', version: 0,
      children: [
        { id: imgId, kind: 'element', type: 'image', attrs: { src: 'x.png', alt: '' }, children: [] },
        { id: generateId(), kind: 'element', type: 'paragraph', attrs: {}, children: [{ id: generateId(), kind: 'text', text: 'P', marks: [] }] },
      ],
    };
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 0, targetPath: [], data: 2 }],
      origin: 'command', timestamp: Date.now(),
    });

    // Image ID is preserved (important for collab + reconciler keyed diffing)
    expect(editor.getState().doc.children[1].id).toBe(imgId);
    cleanup(editor, container);
  });

  it('all node IDs remain unique after multiple moves', () => {
    const doc = makeDoc([
      { type: 'paragraph', text: 'A' },
      { type: 'image' },
      { type: 'paragraph', text: 'B' },
    ]);
    const { editor, container } = mountEditor(doc);

    // Move image to end
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 1, targetPath: [], data: 3 }],
      origin: 'command', timestamp: Date.now(),
    });

    // Move image back to start
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 2, targetPath: [], data: 0 }],
      origin: 'command', timestamp: Date.now(),
    });

    // Verify all IDs are unique (no duplication)
    const ids = editor.getState().doc.children.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    expect(editor.getState().doc.children.length).toBe(3);
    cleanup(editor, container);
  });

  it('move_node is idempotent: same source and adjacent target is noop', () => {
    const doc = makeDoc([{ type: 'image' }, { type: 'paragraph', text: 'P1' }]);
    const { editor, container } = mountEditor(doc);
    const imgId = editor.getState().doc.children[0].id;

    // move_node from 0 to slot 1 = noop (slot right after source)
    // The engine adjusts: adjustedToOffset = 1 - 1 = 0, so no actual move
    editor.dispatch({
      operations: [{ type: 'move_node', path: [], offset: 0, targetPath: [], data: 1 }],
      origin: 'command', timestamp: Date.now(),
    });

    expect(editor.getState().doc.children[0].id).toBe(imgId);
    expect(editor.getState().doc.children[0].type).toBe('image');
    expect(editor.getState().doc.children.length).toBe(2);
    cleanup(editor, container);
  });
});

// ─── Void Block Deletion via Keyboard ────────────────────────

describe('Void Block Deletion via Keyboard', () => {
  it('should delete image block on Backspace when selected', () => {
    const doc = makeDoc([{ type: 'paragraph', text: 'Before' }, { type: 'image' }, { type: 'paragraph', text: 'After' }]);
    const { editor, container } = mountEditor(doc);

    // Set selection to the image block
    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 1, path: [], offset: 0 }, focus: { blockIndex: 1, path: [], offset: 0 } },
      origin: 'command', timestamp: Date.now(),
    });

    // Simulate keydown Backspace on the editable element
    const editable = editor.getEditableElement()!;
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    editable.dispatchEvent(event);

    expect(editor.getState().doc.children.length).toBe(2);
    expect(editor.getState().doc.children.every((c) => c.type === 'paragraph')).toBe(true);
    cleanup(editor, container);
  });

  it('should delete image block on Delete when selected', () => {
    const doc = makeDoc([{ type: 'paragraph', text: 'Before' }, { type: 'image' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 1, path: [], offset: 0 }, focus: { blockIndex: 1, path: [], offset: 0 } },
      origin: 'command', timestamp: Date.now(),
    });

    const editable = editor.getEditableElement()!;
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    editable.dispatchEvent(event);

    expect(editor.getState().doc.children.length).toBe(1);
    expect(editor.getState().doc.children[0].type).toBe('paragraph');
    cleanup(editor, container);
  });

  it('should insert empty paragraph when deleting last void block', () => {
    const doc = makeDoc([{ type: 'image' }]);
    const { editor, container } = mountEditor(doc);

    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 0, path: [], offset: 0 }, focus: { blockIndex: 0, path: [], offset: 0 } },
      origin: 'command', timestamp: Date.now(),
    });

    const editable = editor.getEditableElement()!;
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));

    expect(editor.getState().doc.children.length).toBe(1);
    expect(editor.getState().doc.children[0].type).toBe('paragraph');
    cleanup(editor, container);
  });
});
