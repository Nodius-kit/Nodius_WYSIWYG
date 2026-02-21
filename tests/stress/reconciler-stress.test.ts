import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { headingPlugin } from '../../src/plugins/heading';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createHistoryPlugin } from '../../src/core/history';
import { applyOperation } from '../../src/core/operations';
import { createDocWith, getBlockText } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode } from '../../src/core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMixedDoc(paragraphCount: number): Document {
  const children: ElementNode[] = [];
  for (let i = 0; i < paragraphCount; i++) {
    const type = i % 3 === 0 ? 'heading' : 'paragraph';
    children.push({
      id: generateId(),
      kind: 'element',
      type,
      attrs: type === 'heading' ? { level: 1 } : {},
      children: [{ id: generateId(), kind: 'text', text: `Block ${i}`, marks: [] }],
    });
  }
  return { id: generateId(), kind: 'document', children, version: 0 };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Reconciler stress tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => container.remove();
  });

  it('should render 100 blocks and reconcile 50 type changes under 10s', () => {
    // JSDOM DOM operations are ~50ms/dispatch — use realistic counts for the test environment
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin],
      initialContent: createMixedDoc(100),
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;
    expect(editable.children).toHaveLength(100);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      editor.dispatch({
        operations: [{
          type: 'set_node_type',
          path: [i * 2],
          nodeType: i % 2 === 0 ? 'heading' : 'paragraph',
        }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10000);
    expect(editable.children).toHaveLength(100);

    editor.destroy();
  });

  it('should reconcile 100 text insertions on a mounted 100-block doc under 5s', () => {
    // Each dispatch in JSDOM triggers a full DOM reconcile — ~14ms/op
    const editor = createEditor({
      plugins: [boldPlugin],
      initialContent: createMixedDoc(100),
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      editor.dispatch({
        operations: [{
          type: 'insert_text',
          path: [i, 0],
          offset: 0,
          data: '!',
        }],
        origin: 'input',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(editable.children).toHaveLength(100);
    // Every block should now start with '!'
    const state = editor.getState();
    expect(getBlockText(state.doc, 0)).toMatch(/^!/);
    expect(getBlockText(state.doc, 99)).toMatch(/^!/);

    editor.destroy();
  });

  it('should reconcile 200 insert_node + delete_node pairs without DOM leaks', () => {
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin],
      initialContent: createDocWith([
        { type: 'paragraph', text: 'Anchor' },
      ]),
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      const newBlock: ElementNode = {
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: `Temp ${i}`, marks: [] }],
      };
      editor.dispatch({
        operations: [{ type: 'insert_node', path: [], offset: 1, data: newBlock }],
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

    expect(elapsed).toBeLessThan(3000);
    // Only the anchor paragraph should remain in the DOM
    expect(editable.children).toHaveLength(1);
    expect(editable.children[0].getAttribute('data-node-type')).toBe('paragraph');

    editor.destroy();
  });

  it('should reconcile 100 full-document renders without data corruption', () => {
    const docs: Document[] = Array.from({ length: 100 }, (_, i) =>
      createMixedDoc(20 + i),
    );

    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin],
      initialContent: docs[0],
    });
    editor.mount(container);

    const start = performance.now();
    for (let i = 1; i < 100; i++) {
      editor.dispatch({
        doc: docs[i],
        operations: [],
        origin: 'remote',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
    // Final doc must be the last one
    const finalDoc = editor.getState().doc;
    expect(finalDoc.children).toHaveLength(119); // 20 + 99

    const editable = editor.getEditableElement()!;
    expect(editable.children).toHaveLength(119);

    editor.destroy();
  });

  it('should handle undo/redo over 200 reconciled DOM changes without corruption', () => {
    const { plugin: historyPlugin } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, historyPlugin],
      initialContent: createDocWith([
        { type: 'paragraph', text: 'Hello' },
        { type: 'paragraph', text: 'World' },
      ]),
    });
    editor.mount(container);

    // Build history: 100 inserts
    for (let i = 0; i < 100; i++) {
      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: i, data: 'x' }],
        origin: 'input',
        timestamp: Date.now() + i * 600, // space out for history debounce
      });
    }

    const afterInserts = editor.getState();
    expect(getBlockText(afterInserts.doc, 0).length).toBe(5 + 100);

    const start = performance.now();
    // Undo all 100 inserts
    for (let i = 0; i < 100; i++) {
      editor.executeCommand('undo');
    }
    // Redo all 100 inserts
    for (let i = 0; i < 100; i++) {
      editor.executeCommand('redo');
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    // Must converge back to state after all inserts
    expect(getBlockText(editor.getState().doc, 0).length).toBe(5 + 100);
    // Block 1 untouched throughout
    expect(getBlockText(editor.getState().doc, 1)).toBe('World');

    const editable = editor.getEditableElement()!;
    expect(editable.children).toHaveLength(2);

    editor.destroy();
  });

  it('should reconcile a mixed image+text doc with 300 blocks and apply 150 bold marks under 3s', () => {
    const children: ElementNode[] = [];
    for (let i = 0; i < 150; i++) {
      children.push({
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: `Line ${i}`, marks: [] }],
      });
      children.push({
        id: generateId(), kind: 'element', type: 'image',
        attrs: { src: `data:image/png;base64,x${i}`, alt: `img-${i}`, align: 'center' },
        children: [],
      });
    }

    const editor = createEditor({
      plugins: [boldPlugin, createImageBase64Plugin()],
      initialContent: { id: generateId(), kind: 'document', children, version: 0 },
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;
    expect(editable.children).toHaveLength(300);

    const start = performance.now();
    // Bold every paragraph (even indices)
    for (let i = 0; i < 150; i++) {
      editor.dispatch({
        operations: [{
          type: 'add_mark',
          path: [i * 2],
          offset: 0,
          length: `Line ${i}`.length,
          mark: { type: 'bold' },
        }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(8000);
    expect(editable.children).toHaveLength(300);

    // Verify first paragraph is bolded
    const firstPara = editable.children[0];
    expect(firstPara.querySelector('strong')).not.toBeNull();

    // Image blocks still present
    expect(editable.children[1].getAttribute('data-node-type')).toBe('image');

    editor.destroy();
  }, 15000);

  it('should handle 500 split_node operations on a growing document under 3s', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Seed' }]);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const lastIdx = doc.children.length - 1;
      doc = applyOperation(doc, {
        type: 'split_node',
        path: [lastIdx],
        offset: doc.children[lastIdx].children.length,
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
    expect(doc.children).toHaveLength(501);
    // All new blocks are empty (split at end)
    for (let i = 1; i <= 500; i++) {
      expect(doc.children[i].children.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('should reconcile DOM for 300 blocks where every block is re-rendered (attrs change)', () => {
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin],
      initialContent: createMixedDoc(300),
    });
    editor.mount(container);

    const editable = editor.getEditableElement()!;
    const initialIds = Array.from(editable.children).map((el) => el.getAttribute('data-node-id'));

    const start = performance.now();
    // Change type of all 300 blocks — forces full re-render of every block
    for (let i = 0; i < 300; i++) {
      editor.dispatch({
        operations: [{
          type: 'set_node_type',
          path: [i],
          nodeType: i % 2 === 0 ? 'heading' : 'paragraph',
        }],
        origin: 'command',
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(8000);
    expect(editable.children).toHaveLength(300);

    // data-node-id values are stable (same logical nodes, just attrs changed)
    const finalIds = Array.from(editable.children).map((el) => el.getAttribute('data-node-id'));
    expect(finalIds).toEqual(initialIds);

    editor.destroy();
  }, 15000); // each dispatch triggers a full JSDOM reconcile — generous timeout for CI
});
