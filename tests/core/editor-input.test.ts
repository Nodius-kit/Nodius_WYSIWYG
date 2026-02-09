import { describe, it, expect } from 'vitest';
import { applyOperation } from '../../src/core/operations';
import type { Document, ElementNode, TextNode } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { getBlockText } from '../helpers';

/**
 * Create a document with multiple text nodes in a block (mixed marks).
 * E.g.: "hello" (plain) + "world" (bold)
 */
function createMultiTextDoc(
  textNodes: Array<{ text: string; marks?: Array<{ type: string }> }>,
  blockType = 'paragraph',
): Document {
  const children: TextNode[] = textNodes.map((t) => ({
    id: generateId(),
    kind: 'text',
    text: t.text,
    marks: t.marks ?? [],
  }));
  return {
    id: generateId(),
    kind: 'document',
    version: 0,
    children: [{
      id: generateId(),
      kind: 'element',
      type: blockType,
      attrs: {},
      children,
    }],
  };
}

describe('Editor Input — Multi-text-node operations', () => {
  describe('insert_text targeting correct text node', () => {
    it('should insert into the second text node when offset is past the first', () => {
      // "hello" (5 chars) + "world" (5 chars)
      const doc = createMultiTextDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      // Insert at global offset 7 → should go into 2nd text node at local offset 2
      const result = applyOperation(doc, {
        type: 'insert_text',
        path: [0, 1],  // second text node
        offset: 2,     // local offset within "world"
        data: 'X',
      });
      const block = result.children[0];
      expect((block.children[1] as TextNode).text).toBe('woXrld');
    });

    it('should insert at the boundary between text nodes', () => {
      const doc = createMultiTextDoc([
        { text: 'hello' },
        { text: 'world' },
      ]);
      // Insert at start of second text node (local offset 0)
      const result = applyOperation(doc, {
        type: 'insert_text',
        path: [0, 1],
        offset: 0,
        data: ' ',
      });
      expect((result.children[0].children[1] as TextNode).text).toBe(' world');
    });

    it('should insert into the third text node in a 3-node block', () => {
      const doc = createMultiTextDoc([
        { text: 'aaa', marks: [{ type: 'bold' }] },
        { text: 'bbb' },
        { text: 'ccc', marks: [{ type: 'italic' }] },
      ]);
      // Insert into third text node at local offset 1
      const result = applyOperation(doc, {
        type: 'insert_text',
        path: [0, 2],
        offset: 1,
        data: 'X',
      });
      expect((result.children[0].children[2] as TextNode).text).toBe('cXcc');
    });
  });

  describe('delete_text targeting correct text node', () => {
    it('should delete from the second text node', () => {
      const doc = createMultiTextDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      // Delete 1 char at local offset 1 in 2nd text node
      const result = applyOperation(doc, {
        type: 'delete_text',
        path: [0, 1],
        offset: 1,
        length: 1,
      });
      expect((result.children[0].children[1] as TextNode).text).toBe('wrld');
    });

    it('should delete from the first text node without affecting the second', () => {
      const doc = createMultiTextDoc([
        { text: 'hello' },
        { text: 'world' },
      ]);
      const result = applyOperation(doc, {
        type: 'delete_text',
        path: [0, 0],
        offset: 3,
        length: 2,
      });
      expect((result.children[0].children[0] as TextNode).text).toBe('hel');
      expect((result.children[0].children[1] as TextNode).text).toBe('world');
    });
  });

  describe('split_node (Enter key) behavior', () => {
    it('should split at end of block — creating empty new block', () => {
      const doc = createMultiTextDoc([{ text: 'Hello' }]);
      const result = applyOperation(doc, {
        type: 'split_node',
        path: [0],
        offset: 1,  // after the only child
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('Hello');
      expect(getBlockText(result, 1)).toBe('');
    });

    it('should split at beginning of block — creating empty block before', () => {
      const doc = createMultiTextDoc([{ text: 'Hello' }]);
      const result = applyOperation(doc, {
        type: 'split_node',
        path: [0],
        offset: 0,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('');
      expect(getBlockText(result, 1)).toBe('Hello');
    });

    it('should split block with multiple text nodes at child boundary', () => {
      const doc = createMultiTextDoc([
        { text: 'hello', marks: [{ type: 'bold' }] },
        { text: 'world' },
      ]);
      const result = applyOperation(doc, {
        type: 'split_node',
        path: [0],
        offset: 1,
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('hello');
      expect(getBlockText(result, 1)).toBe('world');
      // First block's text should still have bold marks
      expect((result.children[0].children[0] as TextNode).marks).toEqual([{ type: 'bold' }]);
    });

    it('mid-text split via delete+split+insert preserves text correctly', () => {
      const doc = createMultiTextDoc([{ text: 'HelloWorld' }]);
      // Simulate mid-text Enter: delete "World", split, insert "World" in new block
      let result = applyOperation(doc, {
        type: 'delete_text',
        path: [0, 0],
        offset: 5,
        length: 5,
      });
      result = applyOperation(result, {
        type: 'split_node',
        path: [0],
        offset: 1,
      });
      result = applyOperation(result, {
        type: 'insert_text',
        path: [1, 0],
        offset: 0,
        data: 'World',
      });
      expect(result.children).toHaveLength(2);
      expect(getBlockText(result, 0)).toBe('Hello');
      expect(getBlockText(result, 1)).toBe('World');
    });
  });

  describe('void block handling', () => {
    it('inserting a paragraph after a void block does not duplicate it', () => {
      const doc: Document = {
        id: generateId(),
        kind: 'document',
        version: 0,
        children: [{
          id: generateId(),
          kind: 'element',
          type: 'image',
          attrs: { src: 'test.png', alt: '' },
          children: [],
        }],
      };
      const emptyParagraph: ElementNode = {
        id: generateId(),
        kind: 'element',
        type: 'paragraph',
        attrs: {},
        children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
      };
      const result = applyOperation(doc, {
        type: 'insert_node',
        path: [],
        offset: 1,
        data: emptyParagraph,
      });
      expect(result.children).toHaveLength(2);
      expect(result.children[0].type).toBe('image');
      expect(result.children[1].type).toBe('paragraph');
    });
  });
});
