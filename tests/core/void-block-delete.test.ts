import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import type { CoreEditor } from '../../src/core/editor';
import type { Document, ElementNode } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { getBlockText } from '../helpers';
import { horizontalRulePlugin } from '../../src/plugins/horizontal-rule';

function createImageNode(src = 'test.png'): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'image',
    attrs: { src, alt: '', caption: '' },
    children: [],
  };
}

function createHRNode(): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'horizontal_rule',
    attrs: {},
    children: [],
  };
}

function createParagraph(text = ''): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'paragraph',
    attrs: {},
    children: [{ id: generateId(), kind: 'text', text, marks: [] }],
  };
}

// Minimal image plugin spec for tests (no DOM dependency)
const imagePluginForTest = {
  name: 'image-base64',
  nodeTypes: [{
    name: 'image',
    group: 'void' as const,
    attrs: { src: { default: '' }, alt: { default: '' }, caption: { default: '' } },
    toDOM: () => ['img', {}] as [string, Record<string, string>],
    parseDOM: [{ tag: 'img' }],
  }],
};

function fireBeforeInput(editable: HTMLElement, inputType: string, data?: string): void {
  const event = new InputEvent('beforeinput', {
    inputType,
    data: data ?? null,
    cancelable: true,
    bubbles: true,
  });
  editable.dispatchEvent(event);
}

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

describe('Void block deletion (Image, HR)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  });

  describe('Backspace on void blocks', () => {
    it('should delete image with Backspace and move cursor to previous block', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [createParagraph('Hello'), createImageNode(), createParagraph('World')],
      };
      const editor = createEditor({ plugins: [imagePluginForTest], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 1, offset: 0 }, { blockIndex: 1, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(editor.getDoc().children).toHaveLength(2);
      expect(editor.getDoc().children[0].type).toBe('paragraph');
      expect(editor.getDoc().children[1].type).toBe('paragraph');
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');
      expect(getBlockText(editor.getDoc(), 1)).toBe('World');

      const sel = editor.getSelection();
      expect(sel).not.toBeNull();
      expect(sel!.anchor.blockIndex).toBe(0);
    });

    it('should delete HR with Backspace', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [createParagraph('Before'), createHRNode(), createParagraph('After')],
      };
      const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 1, offset: 0 }, { blockIndex: 1, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(editor.getDoc().children).toHaveLength(2);
      expect(editor.getDoc().children[0].type).toBe('paragraph');
      expect(editor.getDoc().children[1].type).toBe('paragraph');
    });

    it('should create empty paragraph when deleting the only image in document', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [createImageNode()],
      };
      const editor = createEditor({ plugins: [imagePluginForTest], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(editor.getDoc().children).toHaveLength(1);
      expect(editor.getDoc().children[0].type).toBe('paragraph');
      expect(getBlockText(editor.getDoc(), 0)).toBe('');
    });
  });

  describe('Delete on void blocks', () => {
    it('should delete image with Delete key and move cursor to next block', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [createParagraph('Hello'), createImageNode(), createParagraph('World')],
      };
      const editor = createEditor({ plugins: [imagePluginForTest], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 1, offset: 0 }, { blockIndex: 1, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentForward');

      expect(editor.getDoc().children).toHaveLength(2);
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');
      expect(getBlockText(editor.getDoc(), 1)).toBe('World');

      const sel = editor.getSelection();
      expect(sel).not.toBeNull();
      // Cursor should be at the next block (which is now at index 1)
      expect(sel!.anchor.blockIndex).toBe(1);
    });

    it('should create empty paragraph when deleting the only HR in document', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [createHRNode()],
      };
      const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentForward');

      expect(editor.getDoc().children).toHaveLength(1);
      expect(editor.getDoc().children[0].type).toBe('paragraph');
    });
  });

  describe('Surrounding blocks remain intact', () => {
    it('should not affect paragraphs around a deleted image', () => {
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [
          createParagraph('First paragraph'),
          createImageNode(),
          createParagraph('Third paragraph'),
        ],
      };
      const editor = createEditor({ plugins: [imagePluginForTest], initialContent: doc });
      editor.mount(container);

      setSelection(editor, { blockIndex: 1, offset: 0 }, { blockIndex: 1, offset: 0 });
      fireBeforeInput(editor.getEditableElement()!, 'deleteContentBackward');

      expect(editor.getDoc().children).toHaveLength(2);
      expect(getBlockText(editor.getDoc(), 0)).toBe('First paragraph');
      expect(getBlockText(editor.getDoc(), 1)).toBe('Third paragraph');
    });
  });
});
