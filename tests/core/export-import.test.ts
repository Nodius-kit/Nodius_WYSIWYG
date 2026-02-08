import { describe, it, expect } from 'vitest';
import { toJSON, toHTML, toMarkdown } from '../../src/core/export';
import { fromJSON, fromHTML } from '../../src/core/import';
import { createDocWith, extractText, getBlockText, getMarksAt } from '../helpers';
import type { Document, NodeTypeSpec, MarkTypeSpec } from '../../src/core/types';
import { paragraphNodeType } from '../../src/core/schema';
import { headingPlugin } from '../../src/plugins/heading';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { underlinePlugin } from '../../src/plugins/underline';
import { listsPlugin } from '../../src/plugins/lists';

// ─── Specs for HTML round-trip ────────────────────────────────

const nodeTypes: NodeTypeSpec[] = [
  paragraphNodeType,
  ...headingPlugin.nodeTypes!,
  ...listsPlugin.nodeTypes!,
];

const markTypes: MarkTypeSpec[] = [
  ...boldPlugin.markTypes!,
  ...italicPlugin.markTypes!,
  ...underlinePlugin.markTypes!,
];

const specs = { nodeTypes, markTypes };

// ─── JSON round-trip ──────────────────────────────────────────

describe('JSON Export / Import', () => {
  it('should round-trip a simple paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const json = toJSON(doc);
    const imported = fromJSON(json);

    expect(imported.kind).toBe('document');
    expect(imported.children).toHaveLength(1);
    expect(getBlockText(imported, 0)).toBe('Hello World');
  });

  it('should round-trip multiple blocks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
      { type: 'paragraph', text: 'Third' },
    ]);
    const imported = fromJSON(toJSON(doc));

    expect(imported.children).toHaveLength(3);
    expect(getBlockText(imported, 0)).toBe('First');
    expect(getBlockText(imported, 1)).toBe('Second');
    expect(getBlockText(imported, 2)).toBe('Third');
  });

  it('should preserve block types and attrs', () => {
    const doc = createDocWith([
      { type: 'heading', text: 'Title', attrs: { level: 2 } },
      { type: 'paragraph', text: 'Body' },
    ]);
    const imported = fromJSON(toJSON(doc));

    expect(imported.children[0].type).toBe('heading');
    expect(imported.children[0].attrs.level).toBe(2);
    expect(imported.children[1].type).toBe('paragraph');
  });

  it('should preserve marks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Bold text', marks: [{ type: 'bold' }] },
    ]);
    const imported = fromJSON(toJSON(doc));

    const marks = getMarksAt(imported, 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('should regenerate IDs on import', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Test' }]);
    const originalId = doc.id;
    const imported = fromJSON(toJSON(doc));

    expect(imported.id).not.toBe(originalId);
  });

  it('should handle empty text', () => {
    const doc = createDocWith([{ type: 'paragraph', text: '' }]);
    const imported = fromJSON(toJSON(doc));

    expect(imported.children).toHaveLength(1);
    expect(getBlockText(imported, 0)).toBe('');
  });

  it('should throw on invalid JSON', () => {
    expect(() => fromJSON('{ "invalid": true }')).toThrow();
    expect(() => fromJSON('not json')).toThrow();
  });
});

// ─── HTML export ──────────────────────────────────────────────

describe('HTML Export', () => {
  it('should export a paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    const html = toHTML(doc, specs);
    expect(html).toContain('<p>Hello</p>');
  });

  it('should export a heading', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 2 } }]);
    const html = toHTML(doc, specs);
    expect(html).toContain('<h2>Title</h2>');
  });

  it('should export bold marks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }] },
    ]);
    const html = toHTML(doc, specs);
    expect(html).toContain('<strong>Bold</strong>');
  });

  it('should export italic marks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Italic', marks: [{ type: 'italic' }] },
    ]);
    const html = toHTML(doc, specs);
    expect(html).toContain('<em>Italic</em>');
  });

  it('should escape HTML characters', () => {
    const doc = createDocWith([{ type: 'paragraph', text: '<script>alert("xss")</script>' }]);
    const html = toHTML(doc, specs);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should escape ampersands and quotes', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'A & B "C"' }]);
    const html = toHTML(doc, specs);
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });
});

// ─── HTML round-trip ──────────────────────────────────────────

describe('HTML Import', () => {
  it('should import a paragraph', () => {
    const doc = fromHTML('<p>Hello World</p>', specs);
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].type).toBe('paragraph');
    expect(getBlockText(doc, 0)).toBe('Hello World');
  });

  it('should import a heading', () => {
    const doc = fromHTML('<h2>Title</h2>', specs);
    expect(doc.children[0].type).toBe('heading');
    expect(doc.children[0].attrs.level).toBe(2);
    expect(getBlockText(doc, 0)).toBe('Title');
  });

  it('should import bold marks', () => {
    const doc = fromHTML('<p><strong>Bold</strong></p>', specs);
    expect(getBlockText(doc, 0)).toBe('Bold');
    const marks = getMarksAt(doc, 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('should import italic marks', () => {
    const doc = fromHTML('<p><em>Italic</em></p>', specs);
    expect(getBlockText(doc, 0)).toBe('Italic');
    const marks = getMarksAt(doc, 0, 0);
    expect(marks.some((m) => m.type === 'italic')).toBe(true);
  });

  it('should handle empty HTML', () => {
    const doc = fromHTML('', specs);
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].type).toBe('paragraph');
  });

  it('should handle plain text', () => {
    const doc = fromHTML('plain text', specs);
    expect(doc.children.length).toBeGreaterThanOrEqual(1);
    expect(extractText(doc)).toContain('plain text');
  });
});

// ─── HTML round-trip full ─────────────────────────────────────

describe('HTML Round-trip', () => {
  it('should preserve paragraph text through round-trip', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const html = toHTML(doc, specs);
    const imported = fromHTML(html, specs);

    expect(getBlockText(imported, 0)).toBe('Hello World');
    expect(imported.children[0].type).toBe('paragraph');
  });

  it('should preserve heading through round-trip', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
    const html = toHTML(doc, specs);
    const imported = fromHTML(html, specs);

    expect(getBlockText(imported, 0)).toBe('Title');
    expect(imported.children[0].type).toBe('heading');
    expect(imported.children[0].attrs.level).toBe(1);
  });

  it('should preserve bold marks through round-trip', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }] },
    ]);
    const html = toHTML(doc, specs);
    const imported = fromHTML(html, specs);

    expect(getBlockText(imported, 0)).toBe('Bold');
    const marks = getMarksAt(imported, 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);
  });
});

// ─── Markdown Export ──────────────────────────────────────────

describe('Markdown Export', () => {
  it('should export a paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    expect(toMarkdown(doc)).toBe('Hello');
  });

  it('should export headings with # prefix', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
    expect(toMarkdown(doc)).toBe('# Title');
  });

  it('should export h2', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Sub', attrs: { level: 2 } }]);
    expect(toMarkdown(doc)).toBe('## Sub');
  });

  it('should export bold text', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }] },
    ]);
    expect(toMarkdown(doc)).toBe('**Bold**');
  });

  it('should export italic text', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Italic', marks: [{ type: 'italic' }] },
    ]);
    expect(toMarkdown(doc)).toBe('*Italic*');
  });

  it('should export bold+italic text', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'Both', marks: [{ type: 'bold' }, { type: 'italic' }] },
    ]);
    const md = toMarkdown(doc);
    expect(md).toContain('**');
    expect(md).toContain('*');
  });

  it('should export multiple paragraphs separated by blank lines', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);
    expect(toMarkdown(doc)).toBe('First\n\nSecond');
  });

  it('should export images as markdown image syntax', () => {
    const doc = createDocWith([
      { type: 'image', attrs: { src: 'test.png', alt: 'Test Image' } },
    ]);
    expect(toMarkdown(doc)).toBe('![Test Image](test.png)');
  });

  it('should handle empty document', () => {
    const doc = createDocWith([{ type: 'paragraph', text: '' }]);
    expect(toMarkdown(doc)).toBe('');
  });
});
