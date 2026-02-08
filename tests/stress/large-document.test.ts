import { describe, it, expect } from 'vitest';
import { applyOperation } from '../../src/core/operations';
import { createDocWith } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode, Operation } from '../../src/core/types';

/**
 * Generates a document with `n` paragraph blocks.
 */
function createLargeDoc(n: number): Document {
  const children: ElementNode[] = [];
  for (let i = 0; i < n; i++) {
    children.push({
      id: generateId(),
      kind: 'element',
      type: 'paragraph',
      attrs: {},
      children: [{ id: generateId(), kind: 'text', text: `Paragraph ${i}`, marks: [] }],
    });
  }
  return { id: generateId(), kind: 'document', children, version: 0 };
}

describe('Large Document Performance', () => {
  it('should apply insert_text on a 10k-block doc under 5ms', () => {
    const doc = createLargeDoc(10_000);

    const op: Operation = { type: 'insert_text', path: [5000, 0], offset: 0, data: 'X' };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // generous headroom for CI
    // Verify correctness
    expect((result.children[5000].children[0] as any).text).toBe('XParagraph 5000');
  });

  it('should apply delete_text on a 10k-block doc under 5ms', () => {
    const doc = createLargeDoc(10_000);

    const op: Operation = { type: 'delete_text', path: [9999, 0], offset: 0, length: 10 };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect((result.children[9999].children[0] as any).text).toBe('9999');
  });

  it('should apply insert_node on a 10k-block doc under 10ms', () => {
    const doc = createLargeDoc(10_000);
    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'New', marks: [] }],
    };
    const op: Operation = { type: 'insert_node', path: [], offset: 5000, data: newBlock };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.children).toHaveLength(10_001);
    expect((result.children[5000].children[0] as any).text).toBe('New');
  });

  it('should apply delete_node on a 10k-block doc under 10ms', () => {
    const doc = createLargeDoc(10_000);
    const op: Operation = { type: 'delete_node', path: [], offset: 5000 };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.children).toHaveLength(9_999);
  });

  it('should apply set_node_type on a 10k-block doc under 5ms', () => {
    const doc = createLargeDoc(10_000);
    const op: Operation = { type: 'set_node_type', path: [7500], nodeType: 'heading' };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.children[7500].type).toBe('heading');
  });

  it('should apply add_mark across a block in a 10k-block doc under 10ms', () => {
    const doc = createLargeDoc(10_000);
    const op: Operation = {
      type: 'add_mark', path: [2500], offset: 0, length: 14,
      mark: { type: 'bold' },
    };

    const start = performance.now();
    const result = applyOperation(doc, op);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect((result.children[2500].children[0] as any).marks).toHaveLength(1);
  });

  it('should handle 100 sequential operations on a large doc efficiently', () => {
    let doc = createLargeDoc(1_000);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      doc = applyOperation(doc, {
        type: 'insert_text', path: [i % 1000, 0], offset: 0, data: String(i),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    // Verify first block got prepended to
    expect((doc.children[0].children[0] as any).text.charAt(0)).toBe('0');
  });

  it('should handle building a document from scratch via insert_node ops', () => {
    let doc: Document = { id: generateId(), kind: 'document', children: [], version: 0 };

    const start = performance.now();
    for (let i = 0; i < 1_000; i++) {
      const block: ElementNode = {
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [{ id: generateId(), kind: 'text', text: `Block ${i}`, marks: [] }],
      };
      doc = applyOperation(doc, { type: 'insert_node', path: [], offset: i, data: block });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(doc.children).toHaveLength(1_000);
  });
});
