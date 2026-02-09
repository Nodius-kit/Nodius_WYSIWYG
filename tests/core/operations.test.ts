import { describe, it, expect } from 'vitest';
import { applyOperation, applyTransaction } from '../../src/core/operations';
import type { Document, Operation, Mark, ElementNode, TextNode } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { createDocWith, getBlockText, getMarksAt, extractText } from '../helpers';

describe('Operations', () => {
  // ─── insert_text ─────────────────────────────────────────
  describe('insert_text', () => {
    it('should insert text at the beginning', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'World' }]);
      const result = applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: 0, data: 'Hello ',
      });
      expect(getBlockText(result, 0)).toBe('Hello World');
    });

    it('should insert text at the end', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const result = applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: 5, data: ' World',
      });
      expect(getBlockText(result, 0)).toBe('Hello World');
    });

    it('should insert text in the middle', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Helo' }]);
      const result = applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: 2, data: 'l',
      });
      expect(getBlockText(result, 0)).toBe('Hello');
    });

    it('should insert into empty text node', () => {
      const doc = createDocWith([{ type: 'paragraph', text: '' }]);
      const result = applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: 0, data: 'New',
      });
      expect(getBlockText(result, 0)).toBe('New');
    });

    it('should not mutate original document', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Original' }]);
      applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: 0, data: 'X',
      });
      expect(getBlockText(doc, 0)).toBe('Original');
    });
  });

  // ─── delete_text ─────────────────────────────────────────
  describe('delete_text', () => {
    it('should delete text from the beginning', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
      const result = applyOperation(doc, {
        type: 'delete_text', path: [0, 0], offset: 0, length: 6,
      });
      expect(getBlockText(result, 0)).toBe('World');
    });

    it('should delete text from the end', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
      const result = applyOperation(doc, {
        type: 'delete_text', path: [0, 0], offset: 5, length: 6,
      });
      expect(getBlockText(result, 0)).toBe('Hello');
    });

    it('should delete text from the middle', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Helllo' }]);
      const result = applyOperation(doc, {
        type: 'delete_text', path: [0, 0], offset: 2, length: 1,
      });
      expect(getBlockText(result, 0)).toBe('Hello');
    });

    it('should handle deleting all text', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Gone' }]);
      const result = applyOperation(doc, {
        type: 'delete_text', path: [0, 0], offset: 0, length: 4,
      });
      expect(getBlockText(result, 0)).toBe('');
    });
  });

  // ─── insert_node ─────────────────────────────────────────
  describe('insert_node', () => {
    it('should insert a block at document root', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'First' }]);
      const newBlock: ElementNode = {
        id: generateId(), kind: 'element', type: 'paragraph',
        attrs: {}, children: [{ id: generateId(), kind: 'text', text: 'Second', marks: [] }],
      };
      const result = applyOperation(doc, {
        type: 'insert_node', path: [], offset: 1, data: newBlock,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 1)).toBe('Second');
    });

    it('should insert a block at the beginning', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Second' }]);
      const newBlock: ElementNode = {
        id: generateId(), kind: 'element', type: 'paragraph',
        attrs: {}, children: [{ id: generateId(), kind: 'text', text: 'First', marks: [] }],
      };
      const result = applyOperation(doc, {
        type: 'insert_node', path: [], offset: 0, data: newBlock,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('First');
      expect(getBlockText(result, 1)).toBe('Second');
    });

    it('should insert a child node inside a block', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const newText: TextNode = { id: generateId(), kind: 'text', text: ' World', marks: [] };
      const result = applyOperation(doc, {
        type: 'insert_node', path: [0], offset: 1, data: newText,
      });
      expect(result.children[0].children).toHaveLength(2);
    });
  });

  // ─── delete_node ─────────────────────────────────────────
  describe('delete_node', () => {
    it('should delete a block at document root', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'First' },
        { type: 'paragraph', text: 'Second' },
      ]);
      const result = applyOperation(doc, {
        type: 'delete_node', path: [], offset: 0,
      });
      expect(result.children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('Second');
    });

    it('should delete the last block', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'First' },
        { type: 'paragraph', text: 'Second' },
      ]);
      const result = applyOperation(doc, {
        type: 'delete_node', path: [], offset: 1,
      });
      expect(result.children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('First');
    });
  });

  // ─── set_node_type ───────────────────────────────────────
  describe('set_node_type', () => {
    it('should change paragraph to heading', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Title' }]);
      const result = applyOperation(doc, {
        type: 'set_node_type', path: [0], nodeType: 'heading',
      });
      expect(result.children[0].type).toBe('heading');
      expect(getBlockText(result, 0)).toBe('Title');
    });

    it('should change heading back to paragraph', () => {
      const doc = createDocWith([{ type: 'heading', text: 'Title' }]);
      const result = applyOperation(doc, {
        type: 'set_node_type', path: [0], nodeType: 'paragraph',
      });
      expect(result.children[0].type).toBe('paragraph');
    });
  });

  // ─── update_attrs ────────────────────────────────────────
  describe('update_attrs', () => {
    it('should add attributes to a node', () => {
      const doc = createDocWith([{ type: 'heading', text: 'Title' }]);
      const result = applyOperation(doc, {
        type: 'update_attrs', path: [0], attrs: { level: 2 },
      });
      expect(result.children[0].attrs).toEqual({ level: 2 });
    });

    it('should merge with existing attributes', () => {
      const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
      const result = applyOperation(doc, {
        type: 'update_attrs', path: [0], attrs: { align: 'center' },
      });
      expect(result.children[0].attrs).toEqual({ level: 1, align: 'center' });
    });

    it('should override existing attribute values', () => {
      const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
      const result = applyOperation(doc, {
        type: 'update_attrs', path: [0], attrs: { level: 3 },
      });
      expect(result.children[0].attrs).toEqual({ level: 3 });
    });
  });

  // ─── add_mark ────────────────────────────────────────────
  describe('add_mark', () => {
    it('should add bold mark to entire text', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const result = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 5,
        mark: { type: 'bold' },
      });
      const marks = getMarksAt(result, 0, 0);
      expect(marks).toHaveLength(1);
      expect(marks[0].type).toBe('bold');
    });

    it('should add mark to partial text (splits text nodes)', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
      const result = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 5,
        mark: { type: 'bold' },
      });
      // "Hello" should be bold, " World" should not
      const marksHello = getMarksAt(result, 0, 0);
      const marksWorld = getMarksAt(result, 0, 6);
      expect(marksHello).toHaveLength(1);
      expect(marksHello[0].type).toBe('bold');
      expect(marksWorld).toHaveLength(0);
    });

    it('should add mark with attrs', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Click' }]);
      const result = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 5,
        mark: { type: 'link', attrs: { href: 'https://example.com' } },
      });
      const marks = getMarksAt(result, 0, 0);
      expect(marks[0].type).toBe('link');
      expect(marks[0].attrs).toEqual({ href: 'https://example.com' });
    });

    it('should not duplicate existing marks', () => {
      const doc = createDocWith([{
        type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }],
      }]);
      const result = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 4,
        mark: { type: 'bold' },
      });
      const marks = getMarksAt(result, 0, 0);
      expect(marks.filter((m) => m.type === 'bold')).toHaveLength(1);
    });
  });

  // ─── remove_mark ─────────────────────────────────────────
  describe('remove_mark', () => {
    it('should remove bold mark from text', () => {
      const doc = createDocWith([{
        type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }],
      }]);
      const result = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 4,
        mark: { type: 'bold' },
      });
      const marks = getMarksAt(result, 0, 0);
      expect(marks).toHaveLength(0);
    });

    it('should remove mark by type only (loose match)', () => {
      const doc = createDocWith([{
        type: 'paragraph', text: 'Link',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      }]);
      const result = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 4,
        mark: { type: 'link' },
      });
      const marks = getMarksAt(result, 0, 0);
      expect(marks).toHaveLength(0);
    });

    it('should only remove mark from specified range', () => {
      // Create doc with two text nodes, both bold
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [
            { id: generateId(), kind: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
            { id: generateId(), kind: 'text', text: 'World', marks: [{ type: 'bold' }] },
          ],
        }],
      };
      // Remove bold from first 5 chars only ("Hello")
      const result = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 5,
        mark: { type: 'bold' },
      });
      const marksHello = getMarksAt(result, 0, 0);
      const marksWorld = getMarksAt(result, 0, 7);
      expect(marksHello.filter((m) => m.type === 'bold')).toHaveLength(0);
      expect(marksWorld.filter((m) => m.type === 'bold')).toHaveLength(1);
    });
  });

  // ─── wrap_node ───────────────────────────────────────────
  describe('wrap_node', () => {
    it('should wrap a block in a new container', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Item' }]);
      const result = applyOperation(doc, {
        type: 'wrap_node', path: [], offset: 0,
        nodeType: 'list_item',
      });
      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe('list_item');
      expect((result.children[0].children[0] as ElementNode).type).toBe('paragraph');
    });

    it('should preserve the wrapped node content', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Item content' }]);
      const result = applyOperation(doc, {
        type: 'wrap_node', path: [], offset: 0, nodeType: 'blockquote',
      });
      const inner = result.children[0].children[0] as ElementNode;
      const text = inner.children[0] as TextNode;
      expect(text.text).toBe('Item content');
    });
  });

  // ─── lift_node ───────────────────────────────────────────
  describe('lift_node', () => {
    it('should unwrap a node (inverse of wrap)', () => {
      // Create: doc > blockquote > paragraph
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'blockquote', attrs: {},
          children: [{
            id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
            children: [{ id: generateId(), kind: 'text', text: 'Quoted', marks: [] }],
          }],
        }],
      };
      const result = applyOperation(doc, {
        type: 'lift_node', path: [], offset: 0,
      });
      expect(result.children[0].type).toBe('paragraph');
      expect(getBlockText(result, 0)).toBe('Quoted');
    });

    it('should unwrap multiple children', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'blockquote', attrs: {},
          children: [
            {
              id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
              children: [{ id: generateId(), kind: 'text', text: 'First', marks: [] }],
            },
            {
              id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
              children: [{ id: generateId(), kind: 'text', text: 'Second', marks: [] }],
            },
          ],
        }],
      };
      const result = applyOperation(doc, {
        type: 'lift_node', path: [], offset: 0,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('First');
      expect(getBlockText(result, 1)).toBe('Second');
    });
  });

  // ─── split_node ──────────────────────────────────────────
  describe('split_node', () => {
    it('should split a block at child offset', () => {
      // Block with two text nodes: split after first child
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [
            { id: generateId(), kind: 'text', text: 'Hello ', marks: [] },
            { id: generateId(), kind: 'text', text: 'World', marks: [] },
          ],
        }],
      };
      const result = applyOperation(doc, {
        type: 'split_node', path: [0], offset: 1,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('Hello ');
      expect(getBlockText(result, 1)).toBe('World');
    });

    it('should create empty second block when splitting at end', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const result = applyOperation(doc, {
        type: 'split_node', path: [0], offset: 1,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 1)).toBe('');
    });

    it('should preserve block type after split', () => {
      const doc = createDocWith([{ type: 'heading', text: 'Title' }]);
      const result = applyOperation(doc, {
        type: 'split_node', path: [0], offset: 1,
      });
      expect(result.children[0].type).toBe('heading');
      expect(result.children[1].type).toBe('heading');
    });
  });

  // ─── merge_nodes ─────────────────────────────────────────
  describe('merge_nodes', () => {
    it('should merge two adjacent blocks', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'Hello ' },
        { type: 'paragraph', text: 'World' },
      ]);
      const result = applyOperation(doc, {
        type: 'merge_nodes', path: [], offset: 1,
      });
      expect(result.children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('Hello World');
    });

    it('should use the first block type', () => {
      const doc = createDocWith([
        { type: 'heading', text: 'Title' },
        { type: 'paragraph', text: ' extra' },
      ]);
      const result = applyOperation(doc, {
        type: 'merge_nodes', path: [], offset: 1,
      });
      expect(result.children[0].type).toBe('heading');
    });

    it('should throw when offset is 0', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Only' }]);
      expect(() => applyOperation(doc, {
        type: 'merge_nodes', path: [], offset: 0,
      })).toThrow();
    });
  });

  // ─── move_node ───────────────────────────────────────────
  describe('move_node', () => {
    it('should move a block from one position to another', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'First' },
        { type: 'paragraph', text: 'Second' },
        { type: 'paragraph', text: 'Third' },
      ]);
      // Move block 2 to position 0 (move "Third" to the top)
      const result = applyOperation(doc, {
        type: 'move_node', path: [], offset: 2,
        targetPath: [], data: 0,
      });
      expect(getBlockText(result, 0)).toBe('Third');
      expect(getBlockText(result, 1)).toBe('First');
      expect(getBlockText(result, 2)).toBe('Second');
    });
  });

  // ─── normalization ─────────────────────────────────────────
  describe('normalization', () => {
    it('should merge adjacent text nodes with same marks after remove_mark', () => {
      // "Hello World" all bold → remove bold from all → should be 1 text node
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [
            { id: generateId(), kind: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
            { id: generateId(), kind: 'text', text: 'World', marks: [{ type: 'bold' }] },
          ],
        }],
      };
      const result = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 11,
        mark: { type: 'bold' },
      });
      expect(result.children[0].children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('Hello World');
    });

    it('should merge adjacent bold text nodes after add_mark', () => {
      // "Hello" (plain) + "World" (plain) → bold all → should be 1 bold node
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [
            { id: generateId(), kind: 'text', text: 'Hello ', marks: [] },
            { id: generateId(), kind: 'text', text: 'World', marks: [] },
          ],
        }],
      };
      const result = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 11,
        mark: { type: 'bold' },
      });
      expect(result.children[0].children).toHaveLength(1);
      const textNode = result.children[0].children[0] as TextNode;
      expect(textNode.text).toBe('Hello World');
      expect(textNode.marks).toEqual([{ type: 'bold' }]);
    });

    it('should merge text nodes at boundary after merge_nodes', () => {
      // Block1: "Hello" (plain) | Block2: " World" (plain)
      // After merge: should be 1 text node "Hello World"
      const doc = createDocWith([
        { type: 'paragraph', text: 'Hello' },
        { type: 'paragraph', text: ' World' },
      ]);
      const result = applyOperation(doc, {
        type: 'merge_nodes', path: [], offset: 1,
      });
      expect(result.children[0].children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('Hello World');
    });

    it('should not merge text nodes with different marks', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [
            { id: generateId(), kind: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
            { id: generateId(), kind: 'text', text: 'World', marks: [] },
          ],
        }],
      };
      // Remove bold from first 6 chars only
      const result = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 6,
        mark: { type: 'bold' },
      });
      // "Hello " (no marks) + "World" (no marks) → should merge into 1
      expect(result.children[0].children).toHaveLength(1);
      expect(getBlockText(result, 0)).toBe('Hello World');
    });
  });

  // ─── applyTransaction ───────────────────────────────────
  describe('applyTransaction', () => {
    it('should apply multiple operations in sequence', () => {
      const state = {
        doc: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
        selection: null,
      };
      const result = applyTransaction(state, {
        operations: [
          { type: 'insert_text', path: [0, 0], offset: 5, data: ' World' },
          { type: 'insert_text', path: [0, 0], offset: 11, data: '!' },
        ],
        origin: 'test',
        timestamp: Date.now(),
      });
      expect(getBlockText(result.doc, 0)).toBe('Hello World!');
    });

    it('should bump version', () => {
      const state = {
        doc: createDocWith([{ type: 'paragraph', text: '' }]),
        selection: null,
      };
      const result = applyTransaction(state, {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });
      expect(result.doc.version).toBe(1);
    });

    it('should use tr.doc when provided', () => {
      const state = {
        doc: createDocWith([{ type: 'paragraph', text: 'Old' }]),
        selection: null,
      };
      const newDoc = createDocWith([{ type: 'paragraph', text: 'New' }]);
      const result = applyTransaction(state, {
        operations: [],
        doc: newDoc,
        origin: 'history:undo',
        timestamp: Date.now(),
      });
      expect(getBlockText(result.doc, 0)).toBe('New');
    });

    it('should update selection from transaction', () => {
      const state = {
        doc: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
        selection: null,
      };
      const sel = {
        anchor: { blockIndex: 0, path: [0, 0], offset: 5 },
        focus: { blockIndex: 0, path: [0, 0], offset: 5 },
      };
      const result = applyTransaction(state, {
        operations: [],
        selection: sel,
        origin: 'test',
        timestamp: Date.now(),
      });
      expect(result.selection).toEqual(sel);
    });

    it('should not mutate original state', () => {
      const state = {
        doc: createDocWith([{ type: 'paragraph', text: 'Original' }]),
        selection: null,
      };
      applyTransaction(state, {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });
      expect(getBlockText(state.doc, 0)).toBe('Original');
    });
  });
});
