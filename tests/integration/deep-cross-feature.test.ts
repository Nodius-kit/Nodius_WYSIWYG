/**
 * Deep cross-feature integration tests.
 * Each test combines 3+ features to verify they interact correctly.
 */
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
import { generateDelta, applyDelta } from '../../src/collaboration/delta';
import { MemoryTransport } from '../../src/collaboration/transport';
import { toJSON, toHTML, toMarkdown } from '../../src/core/export';
import { fromJSON, fromHTML } from '../../src/core/import';
import { paragraphNodeType } from '../../src/core/schema';
import { createDocWith, extractText, getBlockText, getMarksAt } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode, Operation, EditorSelection, NodeTypeSpec, MarkTypeSpec } from '../../src/core/types';

// ─── Shared specs for HTML round-trip ──────────────────────────

const nodeTypes: NodeTypeSpec[] = [
  paragraphNodeType,
  ...headingPlugin.nodeTypes!,
  ...listsPlugin.nodeTypes!,
  ...createImageBase64Plugin().nodeTypes!,
];

const markTypes: MarkTypeSpec[] = [
  ...boldPlugin.markTypes!,
  ...italicPlugin.markTypes!,
  ...underlinePlugin.markTypes!,
];

const specs = { nodeTypes, markTypes };

function allPlugins() {
  const { plugin: hist } = createHistoryPlugin();
  return [boldPlugin, italicPlugin, underlinePlugin, headingPlugin, listsPlugin, createImageBase64Plugin(), hist];
}

// ─── Marks + Selection + History ──────────────────────────────

describe('Marks + Selection + History', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should bold, then italic on same range, then undo both to return to original', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    // Disable debounce so each toggle creates a separate history entry
    const { plugin: hist } = createHistoryPlugin({ batchDelay: 0 });
    const editor = createEditor({
      plugins: [boldPlugin, italicPlugin, hist],
      initialContent: doc,
    });
    editor.mount(container);

    const sel: EditorSelection = {
      anchor: { blockIndex: 0, path: [], offset: 0 },
      focus: { blockIndex: 0, path: [], offset: 5 },
    };

    // Set selection + toggle bold
    editor.dispatch({ operations: [], selection: sel, origin: 'test', timestamp: Date.now() });
    editor.executeCommand('toggle-bold');

    let marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);

    // Now toggle italic on same selection
    editor.dispatch({ operations: [], selection: sel, origin: 'test', timestamp: Date.now() });
    editor.executeCommand('toggle-italic');

    marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
    expect(marks.some((m) => m.type === 'italic')).toBe(true);

    // Undo italic — restores doc snapshot before italic toggle (bold still there)
    editor.executeCommand('undo');
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World');
    marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
    expect(marks.some((m) => m.type === 'italic')).toBe(false);

    // Undo bold — restores doc snapshot before bold toggle = original
    editor.executeCommand('undo');
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World');
    marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks).toHaveLength(0);

    editor.destroy();
  });

  it('should redo marks after undo', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Test text' }]);
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, underlinePlugin, hist],
      initialContent: doc,
    });
    editor.mount(container);

    const sel: EditorSelection = {
      anchor: { blockIndex: 0, path: [], offset: 0 },
      focus: { blockIndex: 0, path: [], offset: 4 },
    };
    editor.dispatch({ operations: [], selection: sel, origin: 'test', timestamp: Date.now() });
    editor.executeCommand('toggle-bold');
    editor.dispatch({ operations: [], selection: sel, origin: 'test', timestamp: Date.now() });
    editor.executeCommand('toggle-underline');

    // Undo both
    editor.executeCommand('undo');
    editor.executeCommand('undo');
    expect(getMarksAt(editor.getDoc(), 0, 0)).toHaveLength(0);

    // Redo bold
    editor.executeCommand('redo');
    expect(getMarksAt(editor.getDoc(), 0, 0).some((m) => m.type === 'bold')).toBe(true);

    // Redo underline
    editor.executeCommand('redo');
    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
    expect(marks.some((m) => m.type === 'underline')).toBe(true);

    editor.destroy();
  });

  it('should preserve marks through heading type change + undo', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Title', marks: [{ type: 'bold' }] }]);
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, hist],
      initialContent: doc,
    });
    editor.mount(container);

    // Set selection for heading command
    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 0, path: [], offset: 0 }, focus: { blockIndex: 0, path: [], offset: 0 } },
      origin: 'test',
      timestamp: Date.now(),
    });
    editor.executeCommand('set-heading', { level: 1 });

    expect(editor.getDoc().children[0].type).toBe('heading');
    expect(getMarksAt(editor.getDoc(), 0, 0).some((m) => m.type === 'bold')).toBe(true);

    // Undo heading
    editor.executeCommand('undo');
    expect(editor.getDoc().children[0].type).toBe('paragraph');
    expect(getMarksAt(editor.getDoc(), 0, 0).some((m) => m.type === 'bold')).toBe(true);

    editor.destroy();
  });
});

// ─── Export/Import + Marks + Structure ────────────────────────

describe('Export/Import with complex documents', () => {
  it('should JSON round-trip a doc with heading, bold paragraph, and image', () => {
    const imgBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'image',
      attrs: { src: 'data:image/png;base64,abc', alt: 'pic' },
      children: [],
    };
    let doc = createDocWith([
      { type: 'heading', text: 'Title', attrs: { level: 1 } },
      { type: 'paragraph', text: 'Bold text', marks: [{ type: 'bold' }] },
    ]);
    doc = applyOperation(doc, { type: 'insert_node', path: [], offset: 2, data: imgBlock });

    const imported = fromJSON(toJSON(doc));

    expect(imported.children).toHaveLength(3);
    expect(imported.children[0].type).toBe('heading');
    expect(imported.children[0].attrs.level).toBe(1);
    expect(getBlockText(imported, 0)).toBe('Title');
    expect(getMarksAt(imported, 1, 0).some((m) => m.type === 'bold')).toBe(true);
    expect(imported.children[2].type).toBe('image');
    expect(imported.children[2].attrs.src).toBe('data:image/png;base64,abc');
  });

  it('should HTML round-trip a doc with mixed marks (bold + italic)', () => {
    // Create a doc with "Hello" bold, " " plain, "World" italic
    let doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 5,
      mark: { type: 'italic' },
    });

    const html = toHTML(doc, specs);
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');

    const imported = fromHTML(html, specs);
    const text = getBlockText(imported, 0);
    expect(text).toBe('Hello World');

    // "Hello" should be bold
    const boldMarks = getMarksAt(imported, 0, 0);
    expect(boldMarks.some((m) => m.type === 'bold')).toBe(true);

    // "World" should be italic
    const italicMarks = getMarksAt(imported, 0, 6);
    expect(italicMarks.some((m) => m.type === 'italic')).toBe(true);
  });

  it('should Markdown export a doc with headings, lists, and marks', () => {
    const listBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'unordered_list', attrs: {},
      children: [
        {
          id: generateId(), kind: 'element', type: 'list_item', attrs: {},
          children: [{
            id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
            children: [{ id: generateId(), kind: 'text', text: 'Item one', marks: [{ type: 'bold' }] }],
          }],
        },
        {
          id: generateId(), kind: 'element', type: 'list_item', attrs: {},
          children: [{
            id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
            children: [{ id: generateId(), kind: 'text', text: 'Item two', marks: [] }],
          }],
        },
      ],
    };

    let doc = createDocWith([
      { type: 'heading', text: 'My Doc', attrs: { level: 1 } },
      { type: 'paragraph', text: 'Introduction' },
    ]);
    doc = applyOperation(doc, { type: 'insert_node', path: [], offset: 2, data: listBlock });

    const md = toMarkdown(doc);
    expect(md).toContain('# My Doc');
    expect(md).toContain('Introduction');
    expect(md).toContain('- **Item one**');
    expect(md).toContain('- Item two');
  });

  it('should HTML round-trip heading with multiple mark segments', () => {
    // "Hello Bold World" where "Bold" is bold+italic
    let doc = createDocWith([{ type: 'heading', text: 'Hello Bold World', attrs: { level: 2 } }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'bold' },
    });
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'italic' },
    });

    const html = toHTML(doc, specs);
    const imported = fromHTML(html, specs);

    expect(imported.children[0].type).toBe('heading');
    expect(imported.children[0].attrs.level).toBe(2);
    expect(getBlockText(imported, 0)).toBe('Hello Bold World');
  });

  it('should export/import special characters safely', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'a < b && c > d & "quoted"' },
    ]);
    const html = toHTML(doc, specs);
    expect(html).not.toContain('< b');
    expect(html).toContain('&lt;');
    expect(html).toContain('&amp;');

    const imported = fromHTML(html, specs);
    expect(getBlockText(imported, 0)).toBe('a < b && c > d & "quoted"');
  });
});

// ─── OT + Marks + Structure ──────────────────────────────────

describe('OT + complex operations', () => {
  it('should handle concurrent mark add and text insert on same block', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);

    const opsA: Operation[] = [{
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    }];
    const opsB: Operation[] = [{
      type: 'insert_text', path: [0, 0], offset: 5, data: ' Beautiful',
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Path A→B
    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);
    expect(getBlockText(doc1, 0)).toContain('Beautiful');

    // Path B→A
    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);
    expect(getBlockText(doc2, 0)).toContain('Beautiful');
  });

  it('should handle concurrent heading change and bold mark', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Title' }]);

    const opsA: Operation[] = [
      { type: 'set_node_type', path: [0], nodeType: 'heading' },
      { type: 'update_attrs', path: [0], attrs: { level: 1 } },
    ];
    const opsB: Operation[] = [{
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    expect(doc1.children[0].type).toBe('heading');
    expect(getMarksAt(doc1, 0, 0).some((m) => m.type === 'bold')).toBe(true);
  });

  it('should handle concurrent block insert and text edit', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);

    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'Inserted', marks: [] }],
    };

    // A inserts a new block at position 1
    const opsA: Operation[] = [
      { type: 'insert_node', path: [], offset: 1, data: newBlock },
    ];
    // B edits text in block 1 (Second)
    const opsB: Operation[] = [
      { type: 'insert_text', path: [1, 0], offset: 6, data: '!' },
    ];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    expect(doc1.children.length).toBe(3);
    expect(getBlockText(doc1, 0)).toBe('First');
    expect(getBlockText(doc1, 1)).toBe('Inserted');
  });
});

// ─── Delta + Export round-trip ────────────────────────────────

describe('Delta generation + Export coherence', () => {
  it('should generate delta for bold addition, then export correctly', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    let doc2 = { ...doc1, version: 1 };
    doc2 = applyOperation(doc2, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'test-client');
    expect(delta.operations.length).toBeGreaterThan(0);

    // The resulting doc should export with <strong>
    const html = toHTML(doc2, specs);
    expect(html).toContain('<strong>Hello</strong>');
  });

  it('should generate delta for heading change, JSON round-trip the result', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'Title' }]);
    let doc2 = applyOperation(doc1, { type: 'set_node_type', path: [0], nodeType: 'heading' });
    doc2 = applyOperation(doc2, { type: 'update_attrs', path: [0], attrs: { level: 2 } });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'client');
    expect(delta.operations.length).toBeGreaterThan(0);

    const imported = fromJSON(toJSON(doc2));
    expect(imported.children[0].type).toBe('heading');
    expect(imported.children[0].attrs.level).toBe(2);
    expect(getBlockText(imported, 0)).toBe('Title');
  });

  it('should export doc that went through delta apply', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    let doc2 = applyOperation(doc1, {
      type: 'insert_text', path: [0, 0], offset: 5, data: ' World',
    });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'client');
    const doc3 = applyDelta(doc1, delta);

    expect(getBlockText(doc3, 0)).toBe('Hello World');

    const md = toMarkdown(doc3);
    expect(md).toBe('Hello World');
  });
});

// ─── Full editor: marks + blocks + history + export ──────────

describe('Full editor integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should bold text, change to heading, export HTML, import back', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'My Title' }]);
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, hist],
      initialContent: doc,
    });
    editor.mount(container);

    // Bold "My"
    const sel: EditorSelection = {
      anchor: { blockIndex: 0, path: [], offset: 0 },
      focus: { blockIndex: 0, path: [], offset: 2 },
    };
    editor.dispatch({ operations: [], selection: sel, origin: 'test', timestamp: Date.now() });
    editor.executeCommand('toggle-bold');

    // Change to heading
    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 0, path: [], offset: 0 }, focus: { blockIndex: 0, path: [], offset: 0 } },
      origin: 'test',
      timestamp: Date.now(),
    });
    editor.executeCommand('set-heading', { level: 1 });

    // Export
    const html = toHTML(editor.getDoc(), specs);
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>My</strong>');

    // Import
    const imported = fromHTML(html, specs);
    expect(imported.children[0].type).toBe('heading');
    expect(getBlockText(imported, 0)).toBe('My Title');
    expect(getMarksAt(imported, 0, 0).some((m) => m.type === 'bold')).toBe(true);

    editor.destroy();
  });

  it('should handle multi-block: insert text, add block, mark, undo all', () => {
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, hist],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    // Insert text
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' World' }],
      origin: 'input',
      timestamp: Date.now(),
    });
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World');

    // Add new paragraph block
    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'Second para', marks: [] }],
    };
    editor.dispatch({
      operations: [{ type: 'insert_node', path: [], offset: 1, data: newBlock }],
      origin: 'input',
      timestamp: Date.now(),
    });
    expect(editor.getDoc().children).toHaveLength(2);

    // Bold text in second paragraph
    editor.dispatch({
      operations: [{
        type: 'add_mark', path: [1], offset: 0, length: 6,
        mark: { type: 'bold' },
      }],
      origin: 'input',
      timestamp: Date.now(),
    });
    expect(getMarksAt(editor.getDoc(), 1, 0).some((m) => m.type === 'bold')).toBe(true);

    // Undo bold
    editor.executeCommand('undo');
    expect(getMarksAt(editor.getDoc(), 1, 0).some((m) => m.type === 'bold')).toBe(false);

    // Undo block insert
    editor.executeCommand('undo');
    expect(editor.getDoc().children).toHaveLength(1);

    // Undo text insert
    editor.executeCommand('undo');
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');

    editor.destroy();
  });

  it('should export a doc modified by multiple commands', () => {
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, italicPlugin, headingPlugin, hist],
      initialContent: createDocWith([
        { type: 'paragraph', text: 'Intro text' },
        { type: 'paragraph', text: 'Body text' },
      ]),
    });
    editor.mount(container);

    // Make first block a heading
    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 0, path: [], offset: 0 }, focus: { blockIndex: 0, path: [], offset: 0 } },
      origin: 'test',
      timestamp: Date.now(),
    });
    editor.executeCommand('set-heading', { level: 2 });

    // Bold "Body" in second para
    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 1, path: [], offset: 0 }, focus: { blockIndex: 1, path: [], offset: 4 } },
      origin: 'test',
      timestamp: Date.now(),
    });
    editor.executeCommand('toggle-bold');

    const md = toMarkdown(editor.getDoc());
    expect(md).toContain('## Intro text');
    expect(md).toContain('**Body**');

    const html = toHTML(editor.getDoc(), specs);
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>Body</strong>');

    const json = toJSON(editor.getDoc());
    const reimported = fromJSON(json);
    expect(reimported.children[0].type).toBe('heading');
    expect(getMarksAt(reimported, 1, 0).some((m) => m.type === 'bold')).toBe(true);

    editor.destroy();
  });
});

// ─── Collaboration + History interaction ──────────────────────

describe('Collaboration delta + History', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should generate valid delta after history undo', () => {
    const initialDoc = createDocWith([{ type: 'paragraph', text: 'Original' }]);
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [boldPlugin, hist],
      initialContent: initialDoc,
    });
    editor.mount(container);

    // Edit
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 8, data: ' text' }],
      origin: 'input',
      timestamp: Date.now(),
    });
    const afterEdit = editor.getDoc();
    expect(getBlockText(afterEdit, 0)).toBe('Original text');

    // Undo
    editor.executeCommand('undo');
    const afterUndo = editor.getDoc();
    expect(getBlockText(afterUndo, 0)).toBe('Original');

    // Delta from edited to undone should be valid
    const delta = generateDelta(afterEdit, afterUndo, 'client');
    expect(delta.operations.length).toBeGreaterThan(0);

    // Apply delta to afterEdit should give us afterUndo's text
    const applied = applyDelta(afterEdit, delta);
    expect(getBlockText(applied, 0)).toBe('Original');

    editor.destroy();
  });

  it('should not lose marks when generating delta after mark toggle', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const docBefore = doc;

    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    doc = { ...doc, version: 1 };

    const delta = generateDelta(docBefore, doc, 'client');
    const ops = delta.operations;

    // Should have an add_mark operation
    expect(ops.some((op) => op.type === 'add_mark')).toBe(true);

    // Apply delta to original doc should produce same marks
    const applied = applyDelta(docBefore, delta);
    expect(getMarksAt(applied, 0, 0).some((m) => m.type === 'bold')).toBe(true);
    expect(getMarksAt(applied, 0, 6).some((m) => m.type === 'bold')).toBe(false);
  });
});

// ─── Image + marks + export ──────────────────────────────────

describe('Image + marks + export', () => {
  it('should export doc with image block between formatted paragraphs', () => {
    const imgBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'image',
      attrs: { src: 'test.png', alt: 'photo' },
      children: [],
    };

    let doc = createDocWith([
      { type: 'paragraph', text: 'Before', marks: [{ type: 'bold' }] },
      { type: 'paragraph', text: 'After', marks: [{ type: 'italic' }] },
    ]);
    doc = applyOperation(doc, { type: 'insert_node', path: [], offset: 1, data: imgBlock });

    expect(doc.children).toHaveLength(3);

    const md = toMarkdown(doc);
    expect(md).toContain('**Before**');
    expect(md).toContain('![photo](test.png)');
    expect(md).toContain('*After*');

    const json = toJSON(doc);
    const reimported = fromJSON(json);
    expect(reimported.children[1].type).toBe('image');
    expect(reimported.children[1].attrs.src).toBe('test.png');
  });

  it('should JSON round-trip image with all attributes', () => {
    const doc = createDocWith([{
      type: 'image',
      attrs: { src: 'data:base64,abc', alt: 'test', width: 200, height: 150, align: 'left', title: 'My Image' },
    }]);

    const imported = fromJSON(toJSON(doc));
    const attrs = imported.children[0].attrs;
    expect(attrs.src).toBe('data:base64,abc');
    expect(attrs.alt).toBe('test');
    expect(attrs.width).toBe(200);
    expect(attrs.height).toBe(150);
    expect(attrs.align).toBe('left');
    expect(attrs.title).toBe('My Image');
  });
});

// ─── Lists + marks + export/import ──────────────────────────

describe('Lists + marks + export/import', () => {
  function createListDoc(): Document {
    return {
      id: generateId(), kind: 'document', version: 0,
      children: [{
        id: generateId(), kind: 'element', type: 'unordered_list', attrs: {},
        children: [
          {
            id: generateId(), kind: 'element', type: 'list_item', attrs: {},
            children: [{
              id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
              children: [
                { id: generateId(), kind: 'text', text: 'Bold item', marks: [{ type: 'bold' }] },
              ],
            }],
          },
          {
            id: generateId(), kind: 'element', type: 'list_item', attrs: {},
            children: [{
              id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
              children: [
                { id: generateId(), kind: 'text', text: 'Italic item', marks: [{ type: 'italic' }] },
              ],
            }],
          },
          {
            id: generateId(), kind: 'element', type: 'list_item', attrs: {},
            children: [{
              id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
              children: [
                { id: generateId(), kind: 'text', text: 'Plain item', marks: [] },
              ],
            }],
          },
        ],
      }],
    };
  }

  it('should JSON round-trip list with mixed marks', () => {
    const doc = createListDoc();
    const imported = fromJSON(toJSON(doc));

    expect(imported.children[0].type).toBe('unordered_list');
    const items = imported.children[0].children;
    expect(items).toHaveLength(3);

    // Check marks survived
    const firstItemPara = (items[0] as ElementNode).children[0] as ElementNode;
    const firstText = firstItemPara.children[0] as any;
    expect(firstText.marks.some((m: any) => m.type === 'bold')).toBe(true);

    const secondItemPara = (items[1] as ElementNode).children[0] as ElementNode;
    const secondText = secondItemPara.children[0] as any;
    expect(secondText.marks.some((m: any) => m.type === 'italic')).toBe(true);
  });

  it('should Markdown export list with marks', () => {
    const doc = createListDoc();
    const md = toMarkdown(doc);
    expect(md).toContain('- **Bold item**');
    expect(md).toContain('- *Italic item*');
    expect(md).toContain('- Plain item');
  });

  it('should HTML export list with marks', () => {
    const doc = createListDoc();
    const html = toHTML(doc, specs);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('<strong>Bold item</strong>');
    expect(html).toContain('<em>Italic item</em>');
  });
});

// ─── State events + multi-plugin interaction ─────────────────

describe('State events + multi-plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should emit state:change for every operation and track correctly', () => {
    const changes: { prev: string; next: string }[] = [];
    const editor = createEditor({
      plugins: allPlugins(),
      initialContent: createDocWith([{ type: 'paragraph', text: 'Start' }]),
    });
    editor.mount(container);

    editor.on('state:change', ({ prevState, nextState }) => {
      changes.push({
        prev: getBlockText(prevState.doc, 0),
        next: getBlockText(nextState.doc, 0),
      });
    });

    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: '!' }],
      origin: 'input',
      timestamp: Date.now(),
    });

    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 6, data: '!' }],
      origin: 'input',
      timestamp: Date.now(),
    });

    expect(changes).toHaveLength(2);
    expect(changes[0].prev).toBe('Start');
    expect(changes[0].next).toBe('Start!');
    expect(changes[1].prev).toBe('Start!');
    expect(changes[1].next).toBe('Start!!');

    editor.destroy();
  });

  it('should fire selection:change when selection is set via dispatch', () => {
    const selections: (EditorSelection | null)[] = [];
    const editor = createEditor({
      plugins: [boldPlugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    editor.on('selection:change', ({ selection }) => {
      selections.push(selection);
    });

    editor.dispatch({
      operations: [],
      selection: { anchor: { blockIndex: 0, path: [], offset: 2 }, focus: { blockIndex: 0, path: [], offset: 4 } },
      origin: 'test',
      timestamp: Date.now(),
    });

    expect(selections.length).toBeGreaterThanOrEqual(1);
    expect(selections[selections.length - 1]?.anchor.offset).toBe(2);
    expect(selections[selections.length - 1]?.focus.offset).toBe(4);

    editor.destroy();
  });
});

// ─── Edge cases: empty docs, single char, etc. ───────────────

describe('Edge cases', () => {
  it('should handle empty document through full pipeline', () => {
    const doc = createDocWith([{ type: 'paragraph', text: '' }]);

    // JSON round-trip
    const jsonImported = fromJSON(toJSON(doc));
    expect(jsonImported.children).toHaveLength(1);
    expect(getBlockText(jsonImported, 0)).toBe('');

    // HTML round-trip
    const html = toHTML(doc, specs);
    const htmlImported = fromHTML(html, specs);
    expect(htmlImported.children.length).toBeGreaterThanOrEqual(1);

    // Markdown
    const md = toMarkdown(doc);
    expect(md).toBe('');
  });

  it('should handle single character with all 3 marks', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'X' }]);
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 0, length: 1, mark: { type: 'bold' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 0, length: 1, mark: { type: 'italic' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 0, length: 1, mark: { type: 'underline' } });

    const marks = getMarksAt(doc, 0, 0);
    expect(marks).toHaveLength(3);

    // JSON round-trip preserves all marks
    const imported = fromJSON(toJSON(doc));
    expect(getMarksAt(imported, 0, 0)).toHaveLength(3);

    // Markdown
    const md = toMarkdown(doc);
    expect(md).toContain('**');
    expect(md).toContain('*');
    expect(md).toContain('<u>');
  });

  it('should handle doc with 100 paragraphs through JSON round-trip', () => {
    const blocks = Array.from({ length: 100 }, (_, i) => ({
      type: 'paragraph',
      text: `Paragraph ${i + 1}`,
    }));
    const doc = createDocWith(blocks);

    const imported = fromJSON(toJSON(doc));
    expect(imported.children).toHaveLength(100);
    expect(getBlockText(imported, 0)).toBe('Paragraph 1');
    expect(getBlockText(imported, 99)).toBe('Paragraph 100');
  });

  it('should handle Unicode content through all export formats', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Cafe\u0301 \u2603 \uD83D\uDE00 \u4E16\u754C' },
    ]);

    // JSON
    const jsonImported = fromJSON(toJSON(doc));
    expect(getBlockText(jsonImported, 0)).toContain('\u2603');

    // HTML
    const html = toHTML(doc, specs);
    const htmlImported = fromHTML(html, specs);
    expect(getBlockText(htmlImported, 0)).toContain('\u2603');

    // Markdown
    const md = toMarkdown(doc);
    expect(md).toContain('\u2603');
  });
});
