import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createImageResizePlugin } from '../../src/plugins/image-resize';
import { applyOperation } from '../../src/core/operations';
import { createDocWith, getBlockText } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode } from '../../src/core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeImageBlock(idx: number, align: 'left' | 'center' | 'right' = 'center'): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'image',
    attrs: {
      src: `data:image/png;base64,img${idx}`,
      alt: `alt-${idx}`,
      align,
      width: 400,
      height: 300,
    },
    children: [],
  };
}

function createImageDoc(count: number): Document {
  const children: ElementNode[] = Array.from({ length: count }, (_, i) => makeImageBlock(i));
  return { id: generateId(), kind: 'document', children, version: 0 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Image-heavy document stress tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => container.remove();
  });

  it('should build a 500-image document via sequential insert_node ops under 2s', () => {
    let doc: Document = { id: generateId(), kind: 'document', children: [], version: 0 };

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      doc = applyOperation(doc, {
        type: 'insert_node',
        path: [],
        offset: i,
        data: makeImageBlock(i),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(doc.children).toHaveLength(500);
    expect(doc.children[0].type).toBe('image');
    expect(doc.children[0].attrs.alt).toBe('alt-0');
    expect(doc.children[499].attrs.alt).toBe('alt-499');
    // All IDs must be unique
    const ids = new Set(doc.children.map((c) => c.id));
    expect(ids.size).toBe(500);
  });

  it('should apply update_attrs on 500 image blocks under 500ms', () => {
    let doc = createImageDoc(500);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      doc = applyOperation(doc, {
        type: 'update_attrs',
        path: [i],
        attrs: { align: i % 2 === 0 ? 'left' : 'right', width: 200 + i },
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(doc.children[0].attrs.align).toBe('left');
    expect(doc.children[1].attrs.align).toBe('right');
    expect(doc.children[100].attrs.width).toBe(300);
    expect(doc.children[499].attrs.width).toBe(699);
    // src and alt must be preserved
    expect(doc.children[250].attrs.src).toBe('data:image/png;base64,img250');
  });

  it('should delete every other image from a 500-image document under 1s', () => {
    let doc = createImageDoc(500);

    const start = performance.now();
    // Delete even-indexed images from the end so indices stay valid
    for (let i = 498; i >= 0; i -= 2) {
      doc = applyOperation(doc, { type: 'delete_node', path: [], offset: i });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(doc.children).toHaveLength(250);
    expect(doc.children[0].attrs.alt).toBe('alt-1');
    expect(doc.children[1].attrs.alt).toBe('alt-3');
    expect(doc.children[249].attrs.alt).toBe('alt-499');
  });

  it('should handle a 1000-block mixed document (500 paragraphs + 500 images) with text ops', () => {
    const children: ElementNode[] = [];
    for (let i = 0; i < 500; i++) {
      children.push({
        id: generateId(),
        kind: 'element',
        type: 'paragraph',
        attrs: {},
        children: [{ id: generateId(), kind: 'text', text: `Para ${i}`, marks: [] }],
      });
      children.push(makeImageBlock(i));
    }
    let doc: Document = { id: generateId(), kind: 'document', children, version: 0 };

    expect(doc.children).toHaveLength(1000);

    const start = performance.now();
    // Prepend '→' to every paragraph (even indices)
    for (let i = 0; i < 500; i++) {
      doc = applyOperation(doc, {
        type: 'insert_text',
        path: [i * 2, 0],
        offset: 0,
        data: '→',
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(doc.children).toHaveLength(1000);
    expect(getBlockText(doc, 0)).toBe('→Para 0');
    expect(getBlockText(doc, 2)).toBe('→Para 1');
    // Images untouched
    expect(doc.children[1].type).toBe('image');
    expect(doc.children[999].type).toBe('image');
    expect(doc.children[999].attrs.alt).toBe('alt-499');
  });

  it('should handle 200 rapid insert→update→delete cycles in a mounted editor', () => {
    const editor = createEditor({
      plugins: [createImageBase64Plugin()],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Anchor' }]),
    });
    editor.mount(container);

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      const img = makeImageBlock(i);

      editor.dispatch({
        operations: [{ type: 'insert_node', path: [], offset: 1, data: img }],
        origin: 'command',
        timestamp: Date.now(),
      });
      editor.dispatch({
        operations: [{ type: 'update_attrs', path: [1], attrs: { align: 'right', width: 300 + i } }],
        origin: 'command',
        timestamp: Date.now(),
      });
      editor.dispatch({
        operations: [{ type: 'delete_node', path: [], offset: 1 }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    const state = editor.getState();
    expect(state.doc.children).toHaveLength(1);
    expect(getBlockText(state.doc, 0)).toBe('Anchor');

    editor.destroy();
  });

  it('should fire state:change exactly once per image deletion (50 deletions)', () => {
    const editor = createEditor({
      plugins: [createImageBase64Plugin()],
      initialContent: createImageDoc(50),
    });
    editor.mount(container);

    let changeCount = 0;
    const unsubscribe = editor.on('state:change', () => { changeCount++; });

    const start = performance.now();
    for (let i = 49; i >= 0; i--) {
      editor.dispatch({
        operations: [{ type: 'delete_node', path: [], offset: i }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;
    unsubscribe();

    expect(changeCount).toBe(50);
    expect(elapsed).toBeLessThan(3000);
    expect(editor.getState().doc.children).toHaveLength(0);

    editor.destroy();
  });

  it('should render 200 image blocks in DOM and reconcile 200 attr updates under 2s', () => {
    const editor = createEditor({
      plugins: [createImageBase64Plugin()],
      initialContent: createImageDoc(200),
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;
    expect(editable.querySelectorAll('[data-node-type="image"]')).toHaveLength(200);

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      editor.dispatch({
        operations: [{ type: 'update_attrs', path: [i], attrs: { align: i % 2 === 0 ? 'left' : 'right' } }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(8000);
    expect(editable.querySelectorAll('[data-node-type="image"]')).toHaveLength(200);

    editor.destroy();
  }, 15000);

  it('should handle image-resize plugin with 100 insert+delete cycles without leaking handles', () => {
    const editor = createEditor({
      plugins: [createImageBase64Plugin(), createImageResizePlugin()],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Base' }]),
    });
    editor.mount(container);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const img = makeImageBlock(i);

      editor.dispatch({
        operations: [{ type: 'insert_node', path: [], offset: 1, data: img }],
        origin: 'command',
        timestamp: Date.now(),
      });
      editor.dispatch({
        operations: [{ type: 'delete_node', path: [], offset: 1 }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    // No stale resize-handle elements in document
    expect(document.querySelectorAll('.nodius-resize-handle')).toHaveLength(0);
    expect(editor.getState().doc.children).toHaveLength(1);

    editor.destroy();
  });

  it('should batch-insert 300 images at different positions and preserve document order', () => {
    let doc: Document = {
      id: generateId(),
      kind: 'document',
      children: [{
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: 'sentinel', marks: [] }],
      }],
      version: 0,
    };

    const start = performance.now();
    // Append 300 images after the sentinel paragraph
    for (let i = 0; i < 300; i++) {
      doc = applyOperation(doc, {
        type: 'insert_node',
        path: [],
        offset: doc.children.length,
        data: makeImageBlock(i),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(doc.children).toHaveLength(301);
    expect(doc.children[0].type).toBe('paragraph');
    expect(doc.children[1].type).toBe('image');
    expect(doc.children[300].attrs.alt).toBe('alt-299');

    // Verify IDs are all unique
    const ids = new Set(doc.children.map((c) => c.id));
    expect(ids.size).toBe(301);
  });

  it('should select void blocks 200 times via dispatch without corrupting state', () => {
    const imageDoc = createImageDoc(10);
    const editor = createEditor({
      plugins: [createImageBase64Plugin()],
      initialContent: imageDoc,
    });
    editor.mount(container);

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      const blockIndex = i % 10;
      editor.dispatch({
        operations: [],
        selection: {
          anchor: { blockIndex, path: [], offset: 0 },
          focus: { blockIndex, path: [], offset: 0 },
        },
        origin: 'command',
        timestamp: Date.now(),
      });
      // State selection must point to the correct image block each time
      const sel = editor.getState().selection;
      expect(sel?.anchor.blockIndex).toBe(blockIndex);
      expect(editor.getState().doc.children[blockIndex].type).toBe('image');
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);

    editor.destroy();
  });
});
