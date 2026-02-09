import { describe, it, expect } from 'vitest';
import { generateDelta } from '../../src/collaboration/delta';
import { createDocWith } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode, TextNode } from '../../src/core/types';

describe('Delta Generation', () => {
  it('should detect text insertion', () => {
    const prev = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    // Simulate next state with same block IDs but different text
    const next: Document = {
      ...prev,
      version: 1,
      children: [{
        ...prev.children[0],
        children: [{ ...(prev.children[0].children[0] as TextNode), text: 'Hello World' }],
      }],
    };

    const delta = generateDelta(prev, next, 'client-1');
    expect(delta.clientId).toBe('client-1');
    expect(delta.baseVersion).toBe(0);
    expect(delta.resultVersion).toBe(1);
    expect(delta.operations.length).toBeGreaterThan(0);

    // Should have an insert_text op
    const insertOp = delta.operations.find((op) => op.type === 'insert_text');
    expect(insertOp).toBeDefined();
    expect(insertOp!.data).toBe(' World');
  });

  it('should detect text deletion', () => {
    const prev = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const next: Document = {
      ...prev,
      version: 1,
      children: [{
        ...prev.children[0],
        children: [{ ...(prev.children[0].children[0] as TextNode), text: 'Hello' }],
      }],
    };

    const delta = generateDelta(prev, next, 'client-1');
    const deleteOp = delta.operations.find((op) => op.type === 'delete_text');
    expect(deleteOp).toBeDefined();
    expect(deleteOp!.length).toBe(6); // " World"
  });

  it('should detect new block', () => {
    const prev = createDocWith([{ type: 'paragraph', text: 'First' }]);
    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'Second', marks: [] }],
    };
    const next: Document = {
      ...prev,
      version: 1,
      children: [prev.children[0], newBlock],
    };

    const delta = generateDelta(prev, next, 'client-1');
    const insertOp = delta.operations.find((op) => op.type === 'insert_node');
    expect(insertOp).toBeDefined();
    expect(insertOp!.path).toEqual([]);
    expect(insertOp!.offset).toBe(1);
    const insertedNode = insertOp!.data as ElementNode;
    expect(insertedNode.type).toBe('paragraph');
    expect(insertedNode.children[0] && (insertedNode.children[0] as TextNode).text).toBe('Second');
  });

  it('should detect deleted block', () => {
    const prev = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);
    const next: Document = {
      ...prev,
      version: 1,
      children: [prev.children[0]],
    };

    const delta = generateDelta(prev, next, 'client-1');
    const deleteOp = delta.operations.find((op) => op.type === 'delete_node');
    expect(deleteOp).toBeDefined();
    expect(deleteOp!.path).toEqual([]);
    expect(deleteOp!.offset).toBe(1); // second block (index 1) was deleted
  });

  it('should detect type change', () => {
    const prev = createDocWith([{ type: 'paragraph', text: 'Title' }]);
    const next: Document = {
      ...prev,
      version: 1,
      children: [{ ...prev.children[0], type: 'heading' }],
    };

    const delta = generateDelta(prev, next, 'client-1');
    const setTypeOp = delta.operations.find((op) => op.type === 'set_node_type');
    expect(setTypeOp).toBeDefined();
    expect(setTypeOp!.nodeType).toBe('heading');
  });

  it('should produce empty delta for identical docs', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Same' }]);
    const delta = generateDelta(doc, doc, 'client-1');
    expect(delta.operations).toHaveLength(0);
  });
});
