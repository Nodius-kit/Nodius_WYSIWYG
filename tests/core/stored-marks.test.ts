import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import type { CoreEditor } from '../../src/core/editor';
import type { Document, TextNode, Mark } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { isMarkActive } from '../../src/core/mark-utils';
import { getBlockText, getMarksAt } from '../helpers';

function createSimpleDoc(text = 'Hello World'): Document {
  return {
    id: generateId(),
    kind: 'document',
    version: 0,
    children: [{
      id: generateId(),
      kind: 'element',
      type: 'paragraph',
      attrs: {},
      children: [{ id: generateId(), kind: 'text', text, marks: [] }],
    }],
  };
}

function createBoldDoc(text = 'Bold Text'): Document {
  return {
    id: generateId(),
    kind: 'document',
    version: 0,
    children: [{
      id: generateId(),
      kind: 'element',
      type: 'paragraph',
      attrs: {},
      children: [{ id: generateId(), kind: 'text', text, marks: [{ type: 'bold' }] }],
    }],
  };
}

function createMixedDoc(): Document {
  return {
    id: generateId(),
    kind: 'document',
    version: 0,
    children: [{
      id: generateId(),
      kind: 'element',
      type: 'paragraph',
      attrs: {},
      children: [
        { id: generateId(), kind: 'text', text: 'plain', marks: [] },
        { id: generateId(), kind: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { id: generateId(), kind: 'text', text: 'end', marks: [] },
      ],
    }],
  };
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

function fireBeforeInput(editable: HTMLElement, inputType: string, data?: string): void {
  const event = new InputEvent('beforeinput', {
    inputType,
    data: data ?? null,
    cancelable: true,
    bubbles: true,
  });
  editable.dispatchEvent(event);
}

describe('Stored Marks', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  });

  describe('Toggle with collapsed selection', () => {
    it('should store bold mark when toggling with collapsed cursor', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin],
        initialContent: createSimpleDoc(),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });
      editor.executeCommand('toggle-bold');

      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);
    });

    it('should remove bold from storedMarks when toggled twice on plain text', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin],
        initialContent: createSimpleDoc(),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });
      editor.executeCommand('toggle-bold');
      editor.executeCommand('toggle-bold');

      // storedMarks should be empty array (no marks desired) after double toggle on plain text
      expect(editor.getState().storedMarks).toEqual([]);
    });

    it('should store multiple marks (bold + italic)', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin],
        initialContent: createSimpleDoc(),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });
      editor.executeCommand('toggle-bold');
      editor.executeCommand('toggle-italic');

      expect(editor.getState().storedMarks).toEqual([
        { type: 'bold' },
        { type: 'italic' },
      ]);
    });
  });

  describe('Typing with stored marks', () => {
    it('should apply stored bold mark to inserted text', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin],
        initialContent: createSimpleDoc('Hello'),
      });
      editor.mount(container);

      // Place cursor at end
      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });

      // Activate bold via stored marks
      editor.executeCommand('toggle-bold');
      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);

      // Type text
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'X');

      // The inserted "X" should have bold mark
      expect(getBlockText(editor.getDoc(), 0)).toBe('HelloX');
      const marks = getMarksAt(editor.getDoc(), 0, 5);
      expect(marks.some((m) => m.type === 'bold')).toBe(true);

      // Stored marks should be cleared after insertion
      expect(editor.getState().storedMarks).toBeNull();
    });

    it('should apply multiple stored marks to inserted text', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin],
        initialContent: createSimpleDoc('Hi'),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 2 }, { blockIndex: 0, offset: 2 });

      editor.executeCommand('toggle-bold');
      editor.executeCommand('toggle-italic');

      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'AB');

      expect(getBlockText(editor.getDoc(), 0)).toBe('HiAB');

      // "A" should have both bold and italic
      const marksA = getMarksAt(editor.getDoc(), 0, 2);
      expect(marksA.some((m) => m.type === 'bold')).toBe(true);
      expect(marksA.some((m) => m.type === 'italic')).toBe(true);

      // "H" should not have marks
      const marksH = getMarksAt(editor.getDoc(), 0, 0);
      expect(marksH.some((m) => m.type === 'bold')).toBe(false);
    });

    it('should not apply marks to text when storedMarks is null', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createSimpleDoc('Hello'),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });

      // Type without enabling bold
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'Z');

      expect(getBlockText(editor.getDoc(), 0)).toBe('HelloZ');
      const marks = getMarksAt(editor.getDoc(), 0, 5);
      expect(marks.some((m) => m.type === 'bold')).toBe(false);
    });
  });

  describe('Stored marks cleared on selection change', () => {
    it('should clear storedMarks when dispatching a new selection', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createSimpleDoc('Hello World'),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });
      editor.executeCommand('toggle-bold');
      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);

      // Manually change selection via stateManager (simulates DOM selectionchange)
      // We use a dispatch with no ops to change selection
      editor.dispatch({
        operations: [],
        selection: {
          anchor: { blockIndex: 0, path: [], offset: 0 },
          focus: { blockIndex: 0, path: [], offset: 0 },
        },
        storedMarks: null,
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(editor.getState().storedMarks).toBeNull();
    });

    it('should preserve storedMarks when selectionchange fires without position change', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createSimpleDoc('Hello World'),
      });
      editor.mount(container);

      // Place cursor at offset 5
      setSelection(editor, { blockIndex: 0, offset: 5 }, { blockIndex: 0, offset: 5 });

      // Toggle bold → storedMarks set
      editor.executeCommand('toggle-bold');
      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);

      // Simulate a selectionchange that lands at the same position (happens after toolbar click)
      // Dispatch with same selection and no storedMarks override
      editor.dispatch({
        operations: [],
        selection: {
          anchor: { blockIndex: 0, path: [], offset: 5 },
          focus: { blockIndex: 0, path: [], offset: 5 },
        },
        origin: 'test',
        timestamp: Date.now(),
      });

      // storedMarks should still be preserved since position didn't change
      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);
    });
  });

  describe('Toolbar isActive reflects stored marks', () => {
    it('should report bold as active when in storedMarks', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createSimpleDoc(),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 0 });
      editor.executeCommand('toggle-bold');

      const isActive = boldPlugin.toolbarItems![0].isActive!;
      expect(isActive(editor.getState())).toBe(true);
    });

    it('should not report bold as active when storedMarks is empty', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createSimpleDoc(),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 0 }, { blockIndex: 0, offset: 0 });

      const isActive = boldPlugin.toolbarItems![0].isActive!;
      expect(isActive(editor.getState())).toBe(false);
    });
  });

  describe('Detoggle bold on bold text (Bug #1)', () => {
    it('should detoggle bold when cursor is on bold text', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createBoldDoc('BoldText'),
      });
      editor.mount(container);

      // Place cursor inside bold text
      setSelection(editor, { blockIndex: 0, offset: 4 }, { blockIndex: 0, offset: 4 });

      // Toggle bold should remove it (text under cursor is bold)
      editor.executeCommand('toggle-bold');

      // storedMarks should be empty array — bold removed from inherited marks
      expect(editor.getState().storedMarks).toEqual([]);
    });

    it('should report bold as inactive after detoggle on bold text', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createBoldDoc('BoldText'),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 4 }, { blockIndex: 0, offset: 4 });
      editor.executeCommand('toggle-bold');

      // isMarkActive should return false — storedMarks=[] is authoritative
      expect(isMarkActive(editor.getState(), 'bold')).toBe(false);
    });

    it('should type non-bold text after detoggle on bold text', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createBoldDoc('Bold'),
      });
      editor.mount(container);

      // Cursor at end of bold text
      setSelection(editor, { blockIndex: 0, offset: 4 }, { blockIndex: 0, offset: 4 });

      // Detoggle bold
      editor.executeCommand('toggle-bold');
      expect(editor.getState().storedMarks).toEqual([]);

      // Type text — should NOT be bold
      fireBeforeInput(editor.getEditableElement()!, 'insertText', 'X');

      expect(getBlockText(editor.getDoc(), 0)).toBe('BoldX');
      const marksX = getMarksAt(editor.getDoc(), 0, 4);
      expect(marksX.some((m) => m.type === 'bold')).toBe(false);

      // Original text should still be bold
      const marksBold = getMarksAt(editor.getDoc(), 0, 0);
      expect(marksBold.some((m) => m.type === 'bold')).toBe(true);
    });

    it('should re-toggle bold on bold text (toggle off then on)', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createBoldDoc('BoldText'),
      });
      editor.mount(container);

      setSelection(editor, { blockIndex: 0, offset: 4 }, { blockIndex: 0, offset: 4 });

      // Toggle off
      editor.executeCommand('toggle-bold');
      expect(isMarkActive(editor.getState(), 'bold')).toBe(false);

      // Toggle back on
      editor.executeCommand('toggle-bold');
      expect(isMarkActive(editor.getState(), 'bold')).toBe(true);
      expect(editor.getState().storedMarks).toEqual([{ type: 'bold' }]);
    });
  });

  describe('isMarkActive with mixed content', () => {
    it('should reflect text marks when storedMarks is null', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createMixedDoc(),
      });
      editor.mount(container);

      // Cursor in bold region (offset 6 = inside "bold" text node; "plain"=5chars, so 6 is 2nd char of "bold")
      setSelection(editor, { blockIndex: 0, offset: 6 }, { blockIndex: 0, offset: 6 });
      expect(isMarkActive(editor.getState(), 'bold')).toBe(true);

      // Cursor in plain region (offset 2 = inside "plain" text node)
      setSelection(editor, { blockIndex: 0, offset: 2 }, { blockIndex: 0, offset: 2 });
      expect(isMarkActive(editor.getState(), 'bold')).toBe(false);
    });

    it('should respect storedMarks=[] over text marks', () => {
      const editor = createEditor({
        plugins: [boldPlugin],
        initialContent: createMixedDoc(),
      });
      editor.mount(container);

      // Cursor in bold region (offset 6 = inside "bold" text node)
      setSelection(editor, { blockIndex: 0, offset: 6 }, { blockIndex: 0, offset: 6 });

      // Detoggle bold
      editor.executeCommand('toggle-bold');

      // Even though text is bold, storedMarks=[] means not active
      expect(isMarkActive(editor.getState(), 'bold')).toBe(false);
    });
  });
});
