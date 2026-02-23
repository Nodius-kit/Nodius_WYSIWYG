import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import type { CoreEditor } from '../../src/core/editor';
import type { Document, TextNode, EditorNode } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { getBlockText } from '../helpers';

/**
 * Build a document with a single paragraph containing multiple text nodes.
 */
function createMultiNodeDoc(
  textNodes: Array<{ text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }>,
): Document {
  const children: EditorNode[] = textNodes.map((t) => ({
    id: generateId(),
    kind: 'text' as const,
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
      type: 'paragraph',
      attrs: {},
      children,
    }],
  };
}

/**
 * Simulate a beforeinput event on the editable element.
 */
function fireBeforeInput(editable: HTMLElement, inputType: string, data?: string): void {
  const event = new InputEvent('beforeinput', {
    inputType,
    data: data ?? null,
    cancelable: true,
    bubbles: true,
  });
  editable.dispatchEvent(event);
}

/**
 * Set selection on the editor via an empty dispatch.
 */
function setSelection(
  editor: CoreEditor,
  anchor: { blockIndex: number; offset: number },
  focus: { blockIndex: number; offset: number },
): void {
  editor.dispatch({
    operations: [],
    selection: {
      anchor: { blockIndex: anchor.blockIndex, path: [], offset: anchor.offset },
      focus: { blockIndex: focus.blockIndex, path: [], offset: focus.offset },
    },
    origin: 'test',
    timestamp: Date.now(),
  });
}

describe('Selection deletion across multiple text nodes', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  });

  describe('Backspace with selection spanning multiple text nodes', () => {
    it('should delete all text when selecting entire block with mixed marks', () => {
      // Exact reproduction of the user's bug:
      // "ss" (plain) + "ss" (subscript) + "   " (plain) = 7 chars
      const doc = createMultiNodeDoc([
        { text: 'ss' },
        { text: 'ss', marks: [{ type: 'subscript' }] },
        { text: '   ' },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      // Select all text (offset 0 to 7)
      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 7 });

      // Backspace
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      // All text should be deleted
      expect(getBlockText(editor.getDoc(), 0)).toBe('');
    });

    it('should delete across two text nodes with different marks', () => {
      // "hello" (plain) + "world" (bold) = 10 chars
      const doc = createMultiNodeDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      // Select all (0-10)
      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 10 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(getBlockText(editor.getDoc(), 0)).toBe('');
    });

    it('should delete partial range spanning two text nodes', () => {
      // "hello" (plain) + "world" (bold) = 10 chars
      // Select offset 3 to 8 → delete "lo" + "wor"
      const doc = createMultiNodeDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 3 }, { blockIndex: 0, offset: 8 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      // Should keep "hel" (plain) + "ld" (bold)
      expect(getBlockText(editor.getDoc(), 0)).toBe('helld');
    });

    it('should delete across three text nodes', () => {
      // "aaa" (bold) + "bbb" (plain) + "ccc" (italic) = 9 chars
      // Select all
      const doc = createMultiNodeDoc([
        { text: 'aaa', marks: [{ type: 'bold' }] },
        { text: 'bbb' },
        { text: 'ccc', marks: [{ type: 'italic' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 9 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(getBlockText(editor.getDoc(), 0)).toBe('');
    });

    it('should delete range starting mid-node and ending mid-node', () => {
      // "aaa" (bold) + "bbb" (plain) + "ccc" (italic) = 9 chars
      // Select offset 1 to 8 → delete "aa" + "bbb" + "cc"
      const doc = createMultiNodeDoc([
        { text: 'aaa', marks: [{ type: 'bold' }] },
        { text: 'bbb' },
        { text: 'ccc', marks: [{ type: 'italic' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 1 }, { blockIndex: 0, offset: 8 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      // Should keep "a" (bold) + "c" (italic)
      expect(getBlockText(editor.getDoc(), 0)).toBe('ac');
    });

    it('should place cursor at start of deleted range', () => {
      const doc = createMultiNodeDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 2 }, { blockIndex: 0, offset: 8 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      const sel = editor.getSelection();
      expect(sel).not.toBeNull();
      expect(sel!.anchor.offset).toBe(2);
      expect(sel!.focus.offset).toBe(2);
    });
  });

  describe('Delete key with selection spanning multiple text nodes', () => {
    it('should delete all text when selecting entire block', () => {
      const doc = createMultiNodeDoc([
        { text: 'abc' },
        { text: 'def', marks: [{ type: 'italic' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 6 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentForward');

      expect(getBlockText(editor.getDoc(), 0)).toBe('');
    });

    it('should delete partial range across nodes with Delete key', () => {
      const doc = createMultiNodeDoc([
        { text: 'abc' },
        { text: 'def', marks: [{ type: 'bold' }] },
        { text: 'ghi' },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      // Select offset 2-7 → delete "c" + "def" + "g"
      setSelection(editor, { blockIndex: 0, offset: 2 }, { blockIndex: 0, offset: 7 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentForward');

      expect(getBlockText(editor.getDoc(), 0)).toBe('abhi');
    });
  });

  describe('Text replacement (type over selection) across multiple text nodes', () => {
    it('should replace all text when selecting entire multi-node block and typing', () => {
      const doc = createMultiNodeDoc([
        { text: 'ss' },
        { text: 'ss', marks: [{ type: 'subscript' }] },
        { text: '   ' },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 7 });
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'x');

      expect(getBlockText(editor.getDoc(), 0)).toBe('x');
    });

    it('should replace partial selection across nodes with typed text', () => {
      const doc = createMultiNodeDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      // Select offset 3-8, type "X"
      setSelection(editor, { blockIndex: 0, offset: 3 }, { blockIndex: 0, offset: 8 });
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'X');

      // "hel" + "X" + "ld" (bold)
      expect(getBlockText(editor.getDoc(), 0)).toBe('helXld');
    });

    it('should replace entire selection across three nodes with typed text', () => {
      const doc = createMultiNodeDoc([
        { text: 'aaa', marks: [{ type: 'bold' }] },
        { text: 'bbb' },
        { text: 'ccc', marks: [{ type: 'italic' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 9 });
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'Z');

      expect(getBlockText(editor.getDoc(), 0)).toBe('Z');
    });

    it('should place cursor after inserted text', () => {
      const doc = createMultiNodeDoc([
        { text: 'hello' },
        { text: 'world', marks: [{ type: 'bold' }] },
      ]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 2 }, { blockIndex: 0, offset: 8 });
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'XY');

      const sel = editor.getSelection();
      expect(sel).not.toBeNull();
      // Cursor should be at offset 2 + 2 (length of "XY") = 4
      expect(sel!.anchor.offset).toBe(4);
      expect(sel!.focus.offset).toBe(4);
    });
  });

  describe('Single text node selection (regression — should still work)', () => {
    it('should delete selection within a single text node', () => {
      const doc = createMultiNodeDoc([{ text: 'hello world' }]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 11 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(getBlockText(editor.getDoc(), 0)).toBe('hello');
    });

    it('should replace selection within a single text node', () => {
      const doc = createMultiNodeDoc([{ text: 'hello world' }]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 11 });
      fireBeforeInput(editor.getEditableElement()!, 'insertText', '!');

      expect(getBlockText(editor.getDoc(), 0)).toBe('hello!');
    });
  });
});
