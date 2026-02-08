import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { underlinePlugin } from '../../src/plugins/underline';
import { headingPlugin } from '../../src/plugins/heading';
import { listsPlugin } from '../../src/plugins/lists';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createHistoryPlugin } from '../../src/core/history';
import { applyOperation } from '../../src/core/operations';
import { transform } from '../../src/collaboration/ot';
import { createDocWith, getBlockText, getMarksAt } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode, Operation, EditorSelection } from '../../src/core/types';

describe('Cross-Feature Interactions', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should apply bold to text inside a heading', () => {
    const doc = createDocWith([{ type: 'heading', text: 'My Title', attrs: { level: 1 } }]);

    const result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 8,
      mark: { type: 'bold' },
    });

    const marks = (result.children[0].children[0] as any).marks;
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe('bold');
    expect(result.children[0].type).toBe('heading');
  });

  it('should apply multiple marks to the same text range', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'styled text' }]);

    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'bold' },
    });
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'italic' },
    });
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'underline' },
    });

    const marks = getMarksAt(doc, 0, 0);
    expect(marks.length).toBeGreaterThanOrEqual(3);
    const markTypes = marks.map((m) => m.type);
    expect(markTypes).toContain('bold');
    expect(markTypes).toContain('italic');
    expect(markTypes).toContain('underline');
  });

  it('should change block type from paragraph to heading and back', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);

    doc = applyOperation(doc, { type: 'set_node_type', path: [0], nodeType: 'heading' });
    expect(doc.children[0].type).toBe('heading');

    doc = applyOperation(doc, { type: 'set_node_type', path: [0], nodeType: 'paragraph' });
    expect(doc.children[0].type).toBe('paragraph');
    expect(getBlockText(doc, 0)).toBe('Hello');
  });

  it('should handle OT with concurrent mark and text operations', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);

    // Client A adds bold to "Hello"
    const opsA: Operation[] = [{
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    }];
    // Client B inserts text at the end
    const opsB: Operation[] = [{
      type: 'insert_text', path: [0, 0], offset: 11, data: '!',
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Both paths should work without errors
    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    // Text should contain the insertion in both
    expect(getBlockText(doc1, 0)).toContain('!');
    expect(getBlockText(doc2, 0)).toContain('!');
  });

  it('should handle insert_text then undo (history integration)', () => {
    const { plugin: historyPlugin, history } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [historyPlugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    // Simulate a text insertion
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' World' }],
      origin: 'input',
      timestamp: Date.now(),
    });

    expect(getBlockText(editor.getState().doc, 0)).toBe('Hello World');

    // Undo
    editor.executeCommand('undo');
    expect(getBlockText(editor.getState().doc, 0)).toBe('Hello');

    // Redo
    editor.executeCommand('redo');
    expect(getBlockText(editor.getState().doc, 0)).toBe('Hello World');

    editor.destroy();
  });

  it('should handle multiple operations in a single transaction', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);

    const { plugin: historyPlugin } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [historyPlugin],
      initialContent: doc,
    });
    editor.mount(container);

    // Single transaction: change type + add mark
    editor.dispatch({
      operations: [
        { type: 'set_node_type', path: [0], nodeType: 'heading' },
        { type: 'add_mark', path: [1], offset: 0, length: 6, mark: { type: 'bold' } },
      ],
      origin: 'input',
      timestamp: Date.now(),
    });

    const state = editor.getState();
    expect(state.doc.children[0].type).toBe('heading');
    expect(getMarksAt(state.doc, 1, 0).some((m) => m.type === 'bold')).toBe(true);

    // Single undo should revert both
    editor.executeCommand('undo');
    const undone = editor.getState();
    expect(undone.doc.children[0].type).toBe('paragraph');

    editor.destroy();
  });

  it('should handle image block alongside text blocks', () => {
    const imageBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'image',
      attrs: { src: 'data:image/png;base64,test', alt: 'img' },
      children: [],
    };

    let doc = createDocWith([{ type: 'paragraph', text: 'Before image' }]);
    doc = applyOperation(doc, { type: 'insert_node', path: [], offset: 1, data: imageBlock });

    expect(doc.children).toHaveLength(2);
    expect(doc.children[1].type).toBe('image');
    expect(getBlockText(doc, 0)).toBe('Before image');

    // Can still edit text in the paragraph
    doc = applyOperation(doc, { type: 'insert_text', path: [0, 0], offset: 12, data: '!' });
    expect(getBlockText(doc, 0)).toBe('Before image!');
    expect(doc.children[1].type).toBe('image');
  });

  it('should handle list wrapping then text editing', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Item text' }]);

    // Wrap paragraph in list_item, then in unordered_list
    doc = applyOperation(doc, {
      type: 'wrap_node', path: [], offset: 0, nodeType: 'list_item',
    });
    doc = applyOperation(doc, {
      type: 'wrap_node', path: [], offset: 0, nodeType: 'unordered_list',
    });

    expect(doc.children[0].type).toBe('unordered_list');
    const listItem = doc.children[0].children[0] as ElementNode;
    expect(listItem.type).toBe('list_item');

    // Edit the text inside the nested structure
    doc = applyOperation(doc, {
      type: 'insert_text', path: [0, 0, 0, 0], offset: 4, data: ' new',
    });

    const innerParagraph = (doc.children[0].children[0] as ElementNode).children[0] as ElementNode;
    const textNode = innerParagraph.children[0] as any;
    expect(textNode.text).toBe('Item new text');
  });

  it('should handle concurrent type change and text edit via OT', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);

    // Client A changes type to heading
    const opsA: Operation[] = [{ type: 'set_node_type', path: [0], nodeType: 'heading' }];
    // Client B inserts text
    const opsB: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 5, data: '!' }];

    // These are different op types — transform should pass them through
    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    expect(doc1.children[0].type).toBe('heading');
    expect(getBlockText(doc1, 0)).toBe('Hello!');
  });

  it('should handle delete then undo preserving marks', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Bold text',
      marks: [{ type: 'bold' }],
    }]);

    const { plugin: historyPlugin } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [historyPlugin],
      initialContent: doc,
    });
    editor.mount(container);

    // Delete some text
    editor.dispatch({
      operations: [{ type: 'delete_text', path: [0, 0], offset: 4, length: 5 }],
      origin: 'input',
      timestamp: Date.now(),
    });

    expect(getBlockText(editor.getState().doc, 0)).toBe('Bold');

    // Undo should restore the text with marks
    editor.executeCommand('undo');
    const restored = editor.getState().doc;
    expect(getBlockText(restored, 0)).toBe('Bold text');
    expect(getMarksAt(restored, 0, 0).some((m) => m.type === 'bold')).toBe(true);

    editor.destroy();
  });

  it('should handle editor with all standard plugins loaded', () => {
    const { plugin: historyPlugin } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [
        boldPlugin,
        italicPlugin,
        underlinePlugin,
        headingPlugin,
        listsPlugin,
        createImageBase64Plugin(),
        historyPlugin,
      ],
    });
    editor.mount(container);

    // Verify all commands are registered
    const commands = (editor as any).getCommands() as Map<string, unknown>;
    expect(commands.has('toggle-bold')).toBe(true);
    expect(commands.has('toggle-italic')).toBe(true);
    expect(commands.has('toggle-underline')).toBe(true);
    expect(commands.has('set-heading')).toBe(true);
    expect(commands.has('toggle-ordered-list')).toBe(true);
    expect(commands.has('toggle-unordered-list')).toBe(true);
    expect(commands.has('insert-image-base64')).toBe(true);
    expect(commands.has('undo')).toBe(true);
    expect(commands.has('redo')).toBe(true);

    editor.destroy();
  });
});
