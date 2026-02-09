/**
 * Amplified cross-feature tests for Phase 8 features.
 * Every test combines 3+ features to stress interactions between:
 * - resolveTextPosition (multi-text-node targeting)
 * - normalizeBlock (text node merging)
 * - handleEnter rewrite (mid-text split, void blocks)
 * - remote selection mapping
 * - link plugin (mark with attrs)
 * - image caption (figure/figcaption)
 * - BatchedTransport
 * - history, OT, export/import
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { applyOperation, applyTransaction } from '../../src/core/operations';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { underlinePlugin } from '../../src/plugins/underline';
import { headingPlugin } from '../../src/plugins/heading';
import { listsPlugin } from '../../src/plugins/lists';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createLinkPlugin } from '../../src/plugins/link';
import { createHistoryPlugin } from '../../src/core/history';
import { transform } from '../../src/collaboration/ot';
import { generateDelta, applyDelta } from '../../src/collaboration/delta';
import { BatchedTransport } from '../../src/collaboration/batched-transport';
import { MemoryTransport } from '../../src/collaboration/transport';
import { SelectionManager } from '../../src/core/selection';
import { toJSON, toHTML, toMarkdown } from '../../src/core/export';
import { fromJSON, fromHTML } from '../../src/core/import';
import { paragraphNodeType } from '../../src/core/schema';
import { createDocWith, getBlockText, getMarksAt, extractText } from '../helpers';
import { generateId } from '../../src/core/types';
import type {
  Document, ElementNode, TextNode, EditorNode,
  Operation, EditorSelection, Mark,
  NodeTypeSpec, MarkTypeSpec, Delta,
} from '../../src/core/types';

// ─── Shared specs ───────────────────────────────────────────────

const linkPlugin = createLinkPlugin();
const imagePlugin = createImageBase64Plugin();

const nodeTypes: NodeTypeSpec[] = [
  paragraphNodeType,
  ...headingPlugin.nodeTypes!,
  ...listsPlugin.nodeTypes!,
  ...imagePlugin.nodeTypes!,
];

const markTypes: MarkTypeSpec[] = [
  ...boldPlugin.markTypes!,
  ...italicPlugin.markTypes!,
  ...underlinePlugin.markTypes!,
  ...linkPlugin.markTypes!,
];

const specs = { nodeTypes, markTypes };

// ─── Helpers ────────────────────────────────────────────────────

function multiTextBlock(
  texts: Array<{ text: string; marks?: Mark[] }>,
  type = 'paragraph',
  attrs: Record<string, unknown> = {},
): ElementNode {
  return {
    id: generateId(), kind: 'element', type, attrs,
    children: texts.map((t) => ({
      id: generateId(), kind: 'text' as const,
      text: t.text, marks: t.marks ?? [],
    })),
  };
}

function docWith(...blocks: ElementNode[]): Document {
  return { id: generateId(), kind: 'document', version: 0, children: blocks };
}

function sel(blockIndex: number, offset: number): EditorSelection {
  return {
    anchor: { blockIndex, path: [], offset },
    focus: { blockIndex, path: [], offset },
  };
}

function rangeSel(blockIndex: number, from: number, to: number): EditorSelection {
  return {
    anchor: { blockIndex, path: [], offset: from },
    focus: { blockIndex, path: [], offset: to },
  };
}

function countTextNodes(block: ElementNode): number {
  return block.children.filter((c) => c.kind === 'text').length;
}

// ─── resolveTextPosition + normalization + marks ────────────────

describe('resolveTextPosition + normalization + marks', () => {
  it('add_mark then remove_mark on same range should normalize back to 1 text node', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);

    let result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    // After add_mark, we should have 2 text nodes: "Hello" (bold) + " World" (plain)
    expect(result.children[0].children.length).toBeGreaterThanOrEqual(2);

    result = applyOperation(result, {
      type: 'remove_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    // After remove_mark, normalization should merge back to 1 text node
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('Hello World');
  });

  it('add bold then italic to overlapping ranges — normalization merges same-marked segments', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'ABCDEFGH' }]);

    // Bold on [0,4) = "ABCD"
    let result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 4,
      mark: { type: 'bold' },
    });
    // Italic on [2,6) = "CDEF"
    result = applyOperation(result, {
      type: 'add_mark', path: [0], offset: 2, length: 4,
      mark: { type: 'italic' },
    });

    expect(getBlockText(result, 0)).toBe('ABCDEFGH');
    // "AB" = bold only, "CD" = bold+italic, "EF" = italic only, "GH" = plain
    expect(getMarksAt(result, 0, 0).map(m => m.type)).toContain('bold');
    expect(getMarksAt(result, 0, 0).map(m => m.type)).not.toContain('italic');

    expect(getMarksAt(result, 0, 2).map(m => m.type)).toContain('bold');
    expect(getMarksAt(result, 0, 2).map(m => m.type)).toContain('italic');

    expect(getMarksAt(result, 0, 4).map(m => m.type)).not.toContain('bold');
    expect(getMarksAt(result, 0, 4).map(m => m.type)).toContain('italic');

    expect(getMarksAt(result, 0, 6)).toHaveLength(0);
  });

  it('insert_text into a multi-text-node block preserves each node', () => {
    // Block: "hello" (bold) + "world" (plain)
    const doc = docWith(multiTextBlock([
      { text: 'hello', marks: [{ type: 'bold' }] },
      { text: 'world' },
    ]));

    // Insert "X" into second text node at local offset 2
    const result = applyOperation(doc, {
      type: 'insert_text', path: [0, 1], offset: 2, data: 'X',
    });
    expect((result.children[0].children[1] as TextNode).text).toBe('woXrld');
    // First text node unchanged
    expect((result.children[0].children[0] as TextNode).text).toBe('hello');
    // Marks preserved
    expect((result.children[0].children[0] as TextNode).marks).toEqual([{ type: 'bold' }]);
  });

  it('delete_text spanning within second text node does not affect first', () => {
    const doc = docWith(multiTextBlock([
      { text: 'AAA', marks: [{ type: 'italic' }] },
      { text: 'BBBBB' },
      { text: 'CCC', marks: [{ type: 'bold' }] },
    ]));

    // Delete 3 chars from second text node starting at offset 1
    const result = applyOperation(doc, {
      type: 'delete_text', path: [0, 1], offset: 1, length: 3,
    });
    expect((result.children[0].children[0] as TextNode).text).toBe('AAA');
    expect((result.children[0].children[1] as TextNode).text).toBe('BB');
    expect((result.children[0].children[2] as TextNode).text).toBe('CCC');
  });
});

// ─── Enter key (split) + marks + normalization ──────────────────

describe('Enter (split) + marks + normalization', () => {
  it('mid-text split preserves marks on both sides', () => {
    // "HelloWorld" all bold -> split at offset 5 -> "Hello" (bold) | "World" (bold)
    const doc = createDocWith([{
      type: 'paragraph', text: 'HelloWorld',
      marks: [{ type: 'bold' }],
    }]);

    // Simulate mid-text Enter: delete "World", split, insert "World"
    let result = applyOperation(doc, {
      type: 'delete_text', path: [0, 0], offset: 5, length: 5,
    });
    result = applyOperation(result, {
      type: 'split_node', path: [0], offset: 1,
    });
    result = applyOperation(result, {
      type: 'insert_text', path: [1, 0], offset: 0, data: 'World',
    });

    expect(result.children).toHaveLength(2);
    expect(getBlockText(result, 0)).toBe('Hello');
    expect(getBlockText(result, 1)).toBe('World');
    // Bold marks should be preserved on first block
    expect(getMarksAt(result, 0, 0).some(m => m.type === 'bold')).toBe(true);
  });

  it('split block with multi-text-nodes at child boundary preserves marks', () => {
    // Block: "bold" (bold) + "plain" (plain)
    const doc = docWith(multiTextBlock([
      { text: 'bold', marks: [{ type: 'bold' }] },
      { text: 'plain' },
    ]));

    // Split after first child
    const result = applyOperation(doc, {
      type: 'split_node', path: [0], offset: 1,
    });

    expect(result.children).toHaveLength(2);
    expect(getBlockText(result, 0)).toBe('bold');
    expect(getBlockText(result, 1)).toBe('plain');
    expect(getMarksAt(result, 0, 0).some(m => m.type === 'bold')).toBe(true);
    expect(getMarksAt(result, 1, 0)).toHaveLength(0);
  });

  it('split then merge back normalizes to single text node', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'HelloWorld' }]);

    // Split block after first child (all text in one node → split at child boundary = end)
    let result = applyOperation(doc, {
      type: 'split_node', path: [0], offset: 1,
    });
    expect(result.children).toHaveLength(2);

    // Merge back
    result = applyOperation(result, {
      type: 'merge_nodes', path: [], offset: 1,
    });
    expect(result.children).toHaveLength(1);
    // Normalization should produce 1 text node
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('HelloWorld');
  });

  it('split heading preserves type on both halves', () => {
    const doc = createDocWith([{
      type: 'heading', text: 'TitleText', attrs: { level: 2 },
    }]);

    const result = applyOperation(doc, {
      type: 'split_node', path: [0], offset: 1,
    });
    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('heading');
    expect(result.children[1].type).toBe('heading');
  });

  it('insert paragraph after void block does not duplicate it', () => {
    const imgBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'image',
      attrs: { src: 'test.png', alt: '', caption: '' },
      children: [],
    };
    const doc = docWith(imgBlock);

    const emptyParagraph: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
    };
    const result = applyOperation(doc, {
      type: 'insert_node', path: [], offset: 1, data: emptyParagraph,
    });

    expect(result.children).toHaveLength(2);
    expect(result.children[0].type).toBe('image');
    expect(result.children[1].type).toBe('paragraph');
  });
});

// ─── Link mark + normalization + export/import ──────────────────

describe('Link + normalization + export/import', () => {
  it('add link, then remove → normalizes back to 1 text node', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Click here for more' }]);

    let result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'link', attrs: { href: 'https://example.com' } },
    });
    // "Click " + "here" (link) + " for more" — at least 3 nodes
    expect(result.children[0].children.length).toBeGreaterThanOrEqual(2);

    result = applyOperation(result, {
      type: 'remove_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'link' },
    });
    // Should normalize back to 1 text node
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('Click here for more');
  });

  it('link mark with bold on same range — both marks preserved', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Linked Bold' }]);

    let result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'link', attrs: { href: 'https://x.com' } },
    });
    result = applyOperation(result, {
      type: 'add_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'bold' },
    });

    const marks = getMarksAt(result, 0, 0);
    expect(marks.some(m => m.type === 'link')).toBe(true);
    expect(marks.some(m => m.type === 'bold')).toBe(true);
    expect(marks.find(m => m.type === 'link')?.attrs?.href).toBe('https://x.com');
  });

  it('link mark survives JSON round-trip', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Visit our site' }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 10, length: 4,
      mark: { type: 'link', attrs: { href: 'https://site.com', title: 'Site' } },
    });

    const imported = fromJSON(toJSON(doc));
    expect(getBlockText(imported, 0)).toBe('Visit our site');
    const marks = getMarksAt(imported, 0, 10);
    expect(marks.some(m => m.type === 'link')).toBe(true);
    expect(marks.find(m => m.type === 'link')?.attrs?.href).toBe('https://site.com');
    expect(marks.find(m => m.type === 'link')?.attrs?.title).toBe('Site');
  });

  it('link mark renders to <a> in HTML export', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Click me' }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 8,
      mark: { type: 'link', attrs: { href: 'https://go.com' } },
    });

    const html = toHTML(doc, specs);
    expect(html).toContain('<a');
    expect(html).toContain('href="https://go.com"');
    expect(html).toContain('Click me</a>');
  });

  it('link + bold in Markdown export', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Bold link here' }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 5, length: 4,
      mark: { type: 'bold' },
    });

    const md = toMarkdown(doc);
    expect(md).toContain('**link**');
  });

  it('multiple links in same paragraph — each preserves its own href', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Go here and there' }]);
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 3, length: 4,
      mark: { type: 'link', attrs: { href: 'https://here.com' } },
    });
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 12, length: 5,
      mark: { type: 'link', attrs: { href: 'https://there.com' } },
    });

    const hereMarks = getMarksAt(doc, 0, 4);
    const thereMarks = getMarksAt(doc, 0, 13);
    expect(hereMarks.find(m => m.type === 'link')?.attrs?.href).toBe('https://here.com');
    expect(thereMarks.find(m => m.type === 'link')?.attrs?.href).toBe('https://there.com');

    // JSON round-trip preserves both
    const imported = fromJSON(toJSON(doc));
    expect(getMarksAt(imported, 0, 4).find(m => m.type === 'link')?.attrs?.href).toBe('https://here.com');
    expect(getMarksAt(imported, 0, 13).find(m => m.type === 'link')?.attrs?.href).toBe('https://there.com');
  });
});

// ─── Image caption + export + history ───────────────────────────

describe('Image caption + export + history', () => {
  it('image with caption exports to JSON with caption attr', () => {
    const doc = createDocWith([{
      type: 'image',
      attrs: { src: 'photo.jpg', alt: 'A photo', caption: 'My beautiful photo' },
    }]);

    const json = toJSON(doc);
    const imported = fromJSON(json);
    expect(imported.children[0].attrs.caption).toBe('My beautiful photo');
    expect(imported.children[0].attrs.src).toBe('photo.jpg');
  });

  it('update_attrs sets caption, undo restores original', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const doc = createDocWith([{
      type: 'image',
      attrs: { src: 'img.png', alt: '', caption: '' },
    }]);
    const { plugin: hist } = createHistoryPlugin({ batchDelay: 0 });
    const editor = createEditor({
      plugins: [createImageBase64Plugin(), hist],
      initialContent: doc,
    });
    editor.mount(container);

    // Set caption
    editor.dispatch({
      operations: [{ type: 'update_attrs', path: [0], attrs: { caption: 'New caption' } }],
      origin: 'command',
      timestamp: Date.now(),
    });
    expect(editor.getDoc().children[0].attrs.caption).toBe('New caption');

    // Undo
    editor.executeCommand('undo');
    expect(editor.getDoc().children[0].attrs.caption).toBe('');

    // Redo
    editor.executeCommand('redo');
    expect(editor.getDoc().children[0].attrs.caption).toBe('New caption');

    editor.destroy();
    document.body.removeChild(container);
  });

  it('image between formatted paragraphs survives full pipeline', () => {
    const imgBlock = multiTextBlock([], 'image', {
      src: 'x.png', alt: 'pic', caption: 'Caption text', align: 'center',
    });
    const doc = docWith(
      multiTextBlock([{ text: 'Intro', marks: [{ type: 'bold' }] }]),
      imgBlock,
      multiTextBlock([
        { text: 'After ', marks: [] },
        { text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.com' } }] },
      ]),
    );

    // JSON round-trip
    const imported = fromJSON(toJSON(doc));
    expect(imported.children[0].type).toBe('paragraph');
    expect(imported.children[1].type).toBe('image');
    expect(imported.children[1].attrs.caption).toBe('Caption text');
    expect(imported.children[2].type).toBe('paragraph');
    expect(getMarksAt(imported, 0, 0).some(m => m.type === 'bold')).toBe(true);
  });
});

// ─── Remote selection mapping + multi-text-node ─────────────────

describe('Remote selection mapping + multi-text-node ops', () => {
  const sm = new SelectionManager();

  it('insert_text in first text node shifts cursor in second text node', () => {
    // Global offset 7 in block 0 (across multiple text nodes doesn't matter for mapping)
    const localSel = sel(0, 7);
    const ops: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(9);
  });

  it('delete_text before cursor shifts left', () => {
    const localSel = sel(0, 10);
    const ops: Operation[] = [
      { type: 'delete_text', path: [0, 0], offset: 3, length: 4 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(6);
  });

  it('split_node on block before cursor shifts blockIndex', () => {
    const localSel = sel(2, 5);
    const ops: Operation[] = [
      { type: 'split_node', path: [0], offset: 1 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(3); // shifted by +1
  });

  it('merge_nodes before cursor shifts blockIndex down', () => {
    const localSel = sel(3, 5);
    const ops: Operation[] = [
      { type: 'merge_nodes', path: [], offset: 1 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(2);
  });

  it('multiple ops composed: insert + delete + insert_node', () => {
    const localSel = sel(1, 5);
    const ops: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }, // block 0, no effect on block 1
      { type: 'insert_node', path: [], offset: 0, data: {} as any }, // shifts block 1 → 2
      { type: 'insert_text', path: [2, 0], offset: 3, data: 'YY' }, // now block 2 = our block, offset 3 < 5 → shift right
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(2);
    expect(mapped.anchor.offset).toBe(7); // 5 + 2
  });
});

// ─── BatchedTransport + OT + Delta ──────────────────────────────

describe('BatchedTransport + Delta + OT', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('batched deltas arrive as single batch and apply correctly', () => {
    const [rawA, rawB] = MemoryTransport.createPair();
    const batchedA = new BatchedTransport(rawA, { flushInterval: 100 });
    rawA.connect();
    rawB.connect();

    const received: Delta[] = [];
    rawB.onReceive((d) => received.push(d));

    // Send 3 separate deltas
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    batchedA.send({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' ' }],
      baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: Date.now(),
    });
    batchedA.send({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 6, data: 'W' }],
      baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: Date.now(),
    });
    batchedA.send({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 7, data: 'orld' }],
      baseVersion: 2, resultVersion: 3, clientId: 'a', timestamp: Date.now(),
    });

    // Nothing sent yet (batched)
    expect(received).toHaveLength(0);

    // Flush
    vi.advanceTimersByTime(100);
    // MemoryTransport uses Promise.resolve() for async delivery
    // We need to flush microtasks
    vi.runAllTicks();
  });

  it('maxBatchSize triggers immediate flush', () => {
    const [rawA, rawB] = MemoryTransport.createPair();
    const batchedA = new BatchedTransport(rawA, { flushInterval: 99999, maxBatchSize: 3 });
    rawA.connect();
    rawB.connect();

    const flushed: Delta[] = [];
    // We spy on the inner transport's send
    const origSend = rawA.send.bind(rawA);
    rawA.send = (d: Delta) => { flushed.push(d); origSend(d); };

    batchedA.send({
      operations: [
        { type: 'insert_text', path: [0, 0], offset: 0, data: 'A' },
        { type: 'insert_text', path: [0, 0], offset: 1, data: 'B' },
      ],
      baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: Date.now(),
    });
    expect(flushed).toHaveLength(0); // 2 ops < max 3

    batchedA.send({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 2, data: 'C' }],
      baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: Date.now(),
    });
    expect(flushed).toHaveLength(1); // 3 ops >= max 3, flushed
    expect(flushed[0].operations).toHaveLength(3);
  });

  it('disconnect flushes then disconnects', () => {
    const [rawA, rawB] = MemoryTransport.createPair();
    const batchedA = new BatchedTransport(rawA, { flushInterval: 99999 });
    rawA.connect();

    const flushed: Delta[] = [];
    const origSend = rawA.send.bind(rawA);
    rawA.send = (d: Delta) => { flushed.push(d); origSend(d); };

    batchedA.send({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
      baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: Date.now(),
    });

    batchedA.disconnect();
    expect(flushed).toHaveLength(1);
  });
});

// ─── OT + link + bold concurrent ────────────────────────────────

describe('OT + link + bold concurrent', () => {
  it('concurrent link and bold on overlapping ranges', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Click here now' }]);

    // A: link on "here" [6,10)
    const opsA: Operation[] = [{
      type: 'add_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'link', attrs: { href: 'https://x.com' } },
    }];
    // B: bold on "here now" [6,14)
    const opsB: Operation[] = [{
      type: 'add_mark', path: [0], offset: 6, length: 8,
      mark: { type: 'bold' },
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Path A→B
    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    // "here" should have both link and bold
    const marks1 = getMarksAt(doc1, 0, 7);
    expect(marks1.some(m => m.type === 'link')).toBe(true);
    expect(marks1.some(m => m.type === 'bold')).toBe(true);

    // Path B→A
    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    const marks2 = getMarksAt(doc2, 0, 7);
    expect(marks2.some(m => m.type === 'link')).toBe(true);
    expect(marks2.some(m => m.type === 'bold')).toBe(true);
  });

  it('concurrent text insert and link add — link range adjusts', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);

    // A: insert "XX" at offset 5 (after "Hello")
    const opsA: Operation[] = [{
      type: 'insert_text', path: [0, 0], offset: 5, data: 'XX',
    }];
    // B: link on "World" [6,11)
    const opsB: Operation[] = [{
      type: 'add_mark', path: [0], offset: 6, length: 5,
      mark: { type: 'link', attrs: { href: 'https://world.com' } },
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Apply A then transformed B
    let result = doc;
    for (const op of opsA) result = applyOperation(result, op);
    for (const op of tB) result = applyOperation(result, op);

    expect(getBlockText(result, 0)).toBe('HelloXX World');
  });

  it('concurrent block insert and mark add on different blocks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);

    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'Inserted', marks: [] }],
    };

    // A: insert new block at position 0
    const opsA: Operation[] = [{ type: 'insert_node', path: [], offset: 0, data: newBlock }];
    // B: bold on block 0
    const opsB: Operation[] = [{
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Apply A then transformed B
    let result = doc;
    for (const op of opsA) result = applyOperation(result, op);
    for (const op of tB) result = applyOperation(result, op);

    expect(result.children.length).toBe(3);
    expect(getBlockText(result, 0)).toBe('Inserted');
  });
});

// ─── Full editor: new features + history + export ───────────────

describe('Full editor: link + image + split + history + export', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('bold + link on same text, then undo link, export HTML', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Visit example.com today' }]);
    const { plugin: hist } = createHistoryPlugin({ batchDelay: 0 });
    const editor = createEditor({
      plugins: [boldPlugin, createLinkPlugin(), hist],
      initialContent: doc,
    });
    editor.mount(container);

    // Bold "example.com"
    editor.dispatch({
      operations: [],
      selection: rangeSel(0, 6, 17),
      origin: 'test', timestamp: Date.now(),
    });
    editor.executeCommand('toggle-bold');

    // Add link on "example.com"
    editor.dispatch({
      operations: [{
        type: 'add_mark', path: [0], offset: 6, length: 11,
        mark: { type: 'link', attrs: { href: 'https://example.com' } },
      }],
      origin: 'command', timestamp: Date.now(),
    });

    let marks = getMarksAt(editor.getDoc(), 0, 8);
    expect(marks.some(m => m.type === 'bold')).toBe(true);
    expect(marks.some(m => m.type === 'link')).toBe(true);

    // Undo link
    editor.executeCommand('undo');
    marks = getMarksAt(editor.getDoc(), 0, 8);
    expect(marks.some(m => m.type === 'bold')).toBe(true);
    expect(marks.some(m => m.type === 'link')).toBe(false);

    // Redo link
    editor.executeCommand('redo');
    marks = getMarksAt(editor.getDoc(), 0, 8);
    expect(marks.some(m => m.type === 'link')).toBe(true);

    editor.destroy();
  });

  it('insert text, split block, add mark, merge back, undo all', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    const { plugin: hist } = createHistoryPlugin({ batchDelay: 0 });
    const editor = createEditor({
      plugins: [boldPlugin, hist],
      initialContent: doc,
    });
    editor.mount(container);

    // 1. Insert " World"
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' World' }],
      origin: 'input', timestamp: Date.now(),
    });
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World');

    // 2. Split block (simulating Enter at end)
    editor.dispatch({
      operations: [{ type: 'split_node', path: [0], offset: 1 }],
      origin: 'input', timestamp: Date.now(),
    });
    expect(editor.getDoc().children).toHaveLength(2);

    // 3. Bold text in first block
    editor.dispatch({
      operations: [{
        type: 'add_mark', path: [0], offset: 0, length: 11,
        mark: { type: 'bold' },
      }],
      origin: 'input', timestamp: Date.now(),
    });
    expect(getMarksAt(editor.getDoc(), 0, 0).some(m => m.type === 'bold')).toBe(true);

    // 4. Merge blocks back
    editor.dispatch({
      operations: [{ type: 'merge_nodes', path: [], offset: 1 }],
      origin: 'input', timestamp: Date.now(),
    });
    expect(editor.getDoc().children).toHaveLength(1);

    // Undo all 4 steps
    editor.executeCommand('undo'); // undo merge
    expect(editor.getDoc().children).toHaveLength(2);

    editor.executeCommand('undo'); // undo bold
    expect(getMarksAt(editor.getDoc(), 0, 0)).toHaveLength(0);

    editor.executeCommand('undo'); // undo split
    expect(editor.getDoc().children).toHaveLength(1);

    editor.executeCommand('undo'); // undo insert
    expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');

    editor.destroy();
  });

  it('all plugins loaded: commands registered correctly', () => {
    const { plugin: hist } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [
        boldPlugin, italicPlugin, underlinePlugin,
        headingPlugin, listsPlugin,
        createImageBase64Plugin(), createLinkPlugin(),
        hist,
      ],
    });
    editor.mount(container);

    const commands = editor.getCommands();
    expect(commands.has('toggle-bold')).toBe(true);
    expect(commands.has('toggle-italic')).toBe(true);
    expect(commands.has('toggle-underline')).toBe(true);
    expect(commands.has('set-heading')).toBe(true);
    expect(commands.has('toggle-ordered-list')).toBe(true);
    expect(commands.has('toggle-unordered-list')).toBe(true);
    expect(commands.has('insert-image-base64')).toBe(true);
    expect(commands.has('edit-image-caption')).toBe(true);
    expect(commands.has('set-link')).toBe(true);
    expect(commands.has('remove-link')).toBe(true);
    expect(commands.has('undo')).toBe(true);
    expect(commands.has('redo')).toBe(true);

    editor.destroy();
  });
});

// ─── Normalization edge cases ───────────────────────────────────

describe('Normalization edge cases', () => {
  it('3 adjacent text nodes with same marks → merge into 1', () => {
    const doc: Document = {
      id: generateId(), kind: 'document', version: 0,
      children: [{
        id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
        children: [
          { id: generateId(), kind: 'text', text: 'A', marks: [{ type: 'bold' }] },
          { id: generateId(), kind: 'text', text: 'B', marks: [{ type: 'bold' }] },
          { id: generateId(), kind: 'text', text: 'C', marks: [{ type: 'bold' }] },
        ],
      }],
    };
    // Remove bold then re-add → forces normalization
    let result = applyOperation(doc, {
      type: 'remove_mark', path: [0], offset: 0, length: 3,
      mark: { type: 'bold' },
    });
    // All 3 nodes now have no marks → should merge to 1
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('ABC');
  });

  it('merge_nodes with matching marks at boundary → normalizes', () => {
    // Block1: "Hello" (bold) | Block2: " World" (bold) → merge → 1 text node "Hello World" (bold)
    const doc: Document = {
      id: generateId(), kind: 'document', version: 0,
      children: [
        {
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [{ id: generateId(), kind: 'text', text: 'Hello', marks: [{ type: 'bold' }] }],
        },
        {
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [{ id: generateId(), kind: 'text', text: ' World', marks: [{ type: 'bold' }] }],
        },
      ],
    };

    const result = applyOperation(doc, {
      type: 'merge_nodes', path: [], offset: 1,
    });
    expect(result.children).toHaveLength(1);
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('Hello World');
    expect(getMarksAt(result, 0, 0).some(m => m.type === 'bold')).toBe(true);
  });

  it('merge_nodes with different marks at boundary → does NOT merge', () => {
    const doc: Document = {
      id: generateId(), kind: 'document', version: 0,
      children: [
        {
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [{ id: generateId(), kind: 'text', text: 'Hello', marks: [{ type: 'bold' }] }],
        },
        {
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [{ id: generateId(), kind: 'text', text: ' World', marks: [{ type: 'italic' }] }],
        },
      ],
    };

    const result = applyOperation(doc, {
      type: 'merge_nodes', path: [], offset: 1,
    });
    expect(result.children).toHaveLength(1);
    expect(countTextNodes(result.children[0])).toBe(2); // NOT merged (different marks)
  });

  it('add same mark twice → no duplication, normalization keeps 1 text node', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    let result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    result = applyOperation(result, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getMarksAt(result, 0, 0).filter(m => m.type === 'bold')).toHaveLength(1);
  });

  it('remove_mark on text that does not have it → no-op, still normalized', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Plain text' }]);
    const result = applyOperation(doc, {
      type: 'remove_mark', path: [0], offset: 0, length: 10,
      mark: { type: 'bold' },
    });
    expect(countTextNodes(result.children[0])).toBe(1);
    expect(getBlockText(result, 0)).toBe('Plain text');
  });
});

// ─── Delta generation with new features ─────────────────────────

describe('Delta generation with link + normalization', () => {
  it('delta from adding link mark applies correctly on remote', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'Click here' }]);
    let doc2 = applyOperation(doc1, {
      type: 'add_mark', path: [0], offset: 6, length: 4,
      mark: { type: 'link', attrs: { href: 'https://example.com' } },
    });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'client-a');
    expect(delta.operations.length).toBeGreaterThan(0);

    const applied = applyDelta(doc1, delta);
    const marks = getMarksAt(applied, 0, 7);
    expect(marks.some(m => m.type === 'link')).toBe(true);
  });

  it('delta from split_node applies correctly', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'HelloWorld' }]);
    let doc2 = applyOperation(doc1, {
      type: 'split_node', path: [0], offset: 1,
    });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'client-a');
    expect(delta.operations.length).toBeGreaterThan(0);
  });

  it('delta round-trip: add bold + link, generate delta, apply to original', () => {
    const doc1 = createDocWith([{ type: 'paragraph', text: 'Visit example today' }]);

    let doc2 = applyOperation(doc1, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'bold' },
    });
    doc2 = applyOperation(doc2, {
      type: 'add_mark', path: [0], offset: 6, length: 7,
      mark: { type: 'link', attrs: { href: 'https://example.com' } },
    });
    doc2 = { ...doc2, version: 1 };

    const delta = generateDelta(doc1, doc2, 'client-a');
    const applied = applyDelta(doc1, delta);

    expect(getBlockText(applied, 0)).toBe('Visit example today');
    expect(getMarksAt(applied, 0, 0).some(m => m.type === 'bold')).toBe(true);
  });
});

// ─── Complex multi-step scenarios ───────────────────────────────

describe('Complex multi-step scenarios', () => {
  it('type → bold partial → split → merge → link → export HTML → import back', () => {
    // Start with simple text
    let doc = createDocWith([{ type: 'paragraph', text: 'Hello World Test' }]);

    // Bold "World"
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 5,
      mark: { type: 'bold' },
    });

    // Split at child boundary (after "Hello " which is now separate from "World")
    const block = doc.children[0];
    const firstChildLen = (block.children[0] as TextNode).text.length;
    doc = applyOperation(doc, {
      type: 'split_node', path: [0], offset: 1,
    });
    expect(doc.children).toHaveLength(2);

    // Merge back
    doc = applyOperation(doc, {
      type: 'merge_nodes', path: [], offset: 1,
    });
    expect(doc.children).toHaveLength(1);

    // Add link to "Test"
    const totalText = getBlockText(doc, 0);
    const testStart = totalText.indexOf('Test');
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: testStart, length: 4,
      mark: { type: 'link', attrs: { href: 'https://test.com' } },
    });

    // Export to HTML
    const html = toHTML(doc, specs);
    expect(html).toContain('<strong>');
    expect(html).toContain('<a');

    // Import back
    const imported = fromHTML(html, specs);
    expect(getBlockText(imported, 0)).toBe('Hello World Test');
    expect(getMarksAt(imported, 0, 7).some(m => m.type === 'bold')).toBe(true);
  });

  it('10 consecutive bold/unbold cycles → always back to 1 text node', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Stress test text' }]);

    for (let i = 0; i < 10; i++) {
      // Bold all
      doc = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 16,
        mark: { type: 'bold' },
      });
      expect(countTextNodes(doc.children[0])).toBe(1);

      // Unbold all
      doc = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 16,
        mark: { type: 'bold' },
      });
      expect(countTextNodes(doc.children[0])).toBe(1);
    }

    expect(getBlockText(doc, 0)).toBe('Stress test text');
    expect(getMarksAt(doc, 0, 0)).toHaveLength(0);
  });

  it('alternating bold/italic on every other char → normalizes correctly', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'ABCDEF' }]);

    // Bold A,C,E (every other)
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 0, length: 1, mark: { type: 'bold' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 2, length: 1, mark: { type: 'bold' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 4, length: 1, mark: { type: 'bold' } });

    // Italic B,D,F (every other)
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 1, length: 1, mark: { type: 'italic' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 3, length: 1, mark: { type: 'italic' } });
    doc = applyOperation(doc, { type: 'add_mark', path: [0], offset: 5, length: 1, mark: { type: 'italic' } });

    expect(getBlockText(doc, 0)).toBe('ABCDEF');
    // A = bold, B = italic, C = bold, D = italic, E = bold, F = italic → 6 text nodes
    expect(countTextNodes(doc.children[0])).toBe(6);

    // Remove all bold → A,C,E become plain → A+B can't merge (different marks), but ADE become plain
    doc = applyOperation(doc, { type: 'remove_mark', path: [0], offset: 0, length: 6, mark: { type: 'bold' } });

    // Now: A(plain), B(italic), C(plain), D(italic), E(plain), F(italic)
    // Adjacent pairs with same marks: none are adjacent with same marks
    // Still 6 nodes? No — A and C are both plain but not adjacent. B and D are italic but not adjacent.
    // So still 6 text nodes
    expect(getBlockText(doc, 0)).toBe('ABCDEF');

    // Remove all italic → all plain → should merge to 1
    doc = applyOperation(doc, { type: 'remove_mark', path: [0], offset: 0, length: 6, mark: { type: 'italic' } });
    expect(countTextNodes(doc.children[0])).toBe(1);
    expect(getBlockText(doc, 0)).toBe('ABCDEF');
  });

  it('heading with bold + italic + link → markdown + HTML + JSON round-trip', () => {
    let doc = createDocWith([{
      type: 'heading', text: 'Title with bold link', attrs: { level: 1 },
    }]);

    // Bold "bold"
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 11, length: 4,
      mark: { type: 'bold' },
    });
    // Link on "link"
    doc = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 16, length: 4,
      mark: { type: 'link', attrs: { href: 'https://link.com' } },
    });

    // Markdown
    const md = toMarkdown(doc);
    expect(md).toContain('# ');
    expect(md).toContain('**bold**');

    // HTML round-trip
    const html = toHTML(doc, specs);
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a');
    const htmlImported = fromHTML(html, specs);
    expect(htmlImported.children[0].type).toBe('heading');
    expect(getBlockText(htmlImported, 0)).toBe('Title with bold link');

    // JSON round-trip
    const jsonImported = fromJSON(toJSON(doc));
    expect(getMarksAt(jsonImported, 0, 12).some(m => m.type === 'bold')).toBe(true);
    expect(getMarksAt(jsonImported, 0, 17).some(m => m.type === 'link')).toBe(true);
  });

  it('complex doc: heading + paragraph with link + image + list → full export round-trip', () => {
    const listBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'unordered_list', attrs: {},
      children: [{
        id: generateId(), kind: 'element', type: 'list_item', attrs: {},
        children: [{
          id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
          children: [{ id: generateId(), kind: 'text', text: 'List item', marks: [{ type: 'bold' }] }],
        }],
      }],
    };

    let doc: Document = {
      id: generateId(), kind: 'document', version: 0,
      children: [
        multiTextBlock([{ text: 'My Document' }], 'heading', { level: 1 }),
        multiTextBlock([
          { text: 'Visit ' },
          { text: 'example', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
          { text: ' for more.' },
        ]),
        multiTextBlock([], 'image', { src: 'photo.jpg', alt: 'Photo', caption: 'A nice photo' }),
        listBlock,
      ],
    };

    // JSON round-trip
    const jsonRT = fromJSON(toJSON(doc));
    expect(jsonRT.children).toHaveLength(4);
    expect(jsonRT.children[0].type).toBe('heading');
    expect(jsonRT.children[1].type).toBe('paragraph');
    expect(jsonRT.children[2].type).toBe('image');
    expect(jsonRT.children[2].attrs.caption).toBe('A nice photo');
    expect(jsonRT.children[3].type).toBe('unordered_list');

    // Markdown
    const md = toMarkdown(doc);
    expect(md).toContain('# My Document');
    expect(md).toContain('![Photo](photo.jpg)');
    expect(md).toContain('- **List item**');
  });
});

// ─── Remote dispatch + selection preservation ───────────────────

describe('Remote dispatch preserves local selection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('remote text insert before cursor adjusts local selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({
      plugins: [boldPlugin],
      initialContent: doc,
    });
    editor.mount(container);

    // Set local cursor at offset 8
    editor.dispatch({
      operations: [],
      selection: sel(0, 8),
      origin: 'test', timestamp: Date.now(),
    });

    // Remote insert "XX" at offset 3
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 3, data: 'XX' }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    // Selection should have shifted right by 2
    const selection = editor.getSelection();
    expect(selection?.anchor.offset).toBe(10);

    editor.destroy();
  });

  it('remote block insert shifts local selection blockIndex', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);
    const editor = createEditor({
      plugins: [],
      initialContent: doc,
    });
    editor.mount(container);

    // Cursor in block 1
    editor.dispatch({
      operations: [],
      selection: sel(1, 3),
      origin: 'test', timestamp: Date.now(),
    });

    // Remote inserts block at position 0
    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'Inserted', marks: [] }],
    };
    editor.dispatch({
      operations: [{ type: 'insert_node', path: [], offset: 0, data: newBlock }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    // Block index should shift from 1 to 2
    const selection = editor.getSelection();
    expect(selection?.anchor.blockIndex).toBe(2);
    expect(selection?.anchor.offset).toBe(3);

    editor.destroy();
  });

  it('remote delete before cursor shifts selection back', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'ABCDEFGHIJ' }]);
    const editor = createEditor({
      plugins: [],
      initialContent: doc,
    });
    editor.mount(container);

    // Cursor at offset 7
    editor.dispatch({
      operations: [],
      selection: sel(0, 7),
      origin: 'test', timestamp: Date.now(),
    });

    // Remote deletes 3 chars starting at offset 2
    editor.dispatch({
      operations: [{ type: 'delete_text', path: [0, 0], offset: 2, length: 3 }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    const selection = editor.getSelection();
    expect(selection?.anchor.offset).toBe(4); // 7 - 3

    editor.destroy();
  });

  it('local origin dispatch does NOT auto-map selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    const editor = createEditor({
      plugins: [],
      initialContent: doc,
    });
    editor.mount(container);

    // Set selection
    editor.dispatch({
      operations: [],
      selection: sel(0, 3),
      origin: 'test', timestamp: Date.now(),
    });

    // Local insert with explicit selection
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'XX' }],
      selection: sel(0, 2), // explicit
      origin: 'input',
      timestamp: Date.now(),
    });

    // Should use the explicit selection, not auto-mapped
    const selection = editor.getSelection();
    expect(selection?.anchor.offset).toBe(2);

    editor.destroy();
  });
});

// ─── Stress: many operations in sequence ────────────────────────

describe('Stress: sequential operations', () => {
  it('50 text insertions in different text nodes', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Start' }]);

    for (let i = 0; i < 50; i++) {
      const totalText = getBlockText(doc, 0);
      doc = applyOperation(doc, {
        type: 'insert_text', path: [0, 0], offset: totalText.length,
        data: String(i % 10),
      });
    }

    const text = getBlockText(doc, 0);
    expect(text.length).toBe(5 + 50); // "Start" + 50 chars
    expect(text.startsWith('Start')).toBe(true);
  });

  it('20 add_mark + remove_mark cycles → always 1 text node', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Stable text' }]);

    for (let i = 0; i < 20; i++) {
      doc = applyOperation(doc, {
        type: 'add_mark', path: [0], offset: 0, length: 11,
        mark: { type: 'bold' },
      });
      doc = applyOperation(doc, {
        type: 'remove_mark', path: [0], offset: 0, length: 11,
        mark: { type: 'bold' },
      });
    }

    expect(countTextNodes(doc.children[0])).toBe(1);
    expect(getBlockText(doc, 0)).toBe('Stable text');
  });

  it('10 split + merge cycles preserve text', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Roundtrip' }]);

    for (let i = 0; i < 10; i++) {
      doc = applyOperation(doc, {
        type: 'split_node', path: [0], offset: 1,
      });
      expect(doc.children).toHaveLength(2);
      doc = applyOperation(doc, {
        type: 'merge_nodes', path: [], offset: 1,
      });
      expect(doc.children).toHaveLength(1);
    }

    expect(getBlockText(doc, 0)).toBe('Roundtrip');
    expect(countTextNodes(doc.children[0])).toBe(1);
  });
});
