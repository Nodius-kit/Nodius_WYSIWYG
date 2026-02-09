import { describe, it, expect } from 'vitest';
import { applyOperation } from '../../src/core/operations';
import type { Document, TextNode, Mark } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { getBlockText, getMarksAt, createDocWith } from '../helpers';

describe('Link Plugin — operations', () => {
  it('should add link mark with href', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Click here' }]);
    const result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 10,
      mark: { type: 'link', attrs: { href: 'https://example.com' } },
    });
    const marks = getMarksAt(result, 0, 0);
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe('link');
    expect(marks[0].attrs?.href).toBe('https://example.com');
  });

  it('should add link mark with href and title', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Click' }]);
    const result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'link', attrs: { href: 'https://example.com', title: 'Example' } },
    });
    const marks = getMarksAt(result, 0, 0);
    expect(marks[0].attrs?.title).toBe('Example');
  });

  it('should remove link mark by type only (loose match)', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Linked',
      marks: [{ type: 'link', attrs: { href: 'https://foo.com' } }],
    }]);
    const result = applyOperation(doc, {
      type: 'remove_mark', path: [0], offset: 0, length: 6,
      mark: { type: 'link' },
    });
    const marks = getMarksAt(result, 0, 0);
    expect(marks).toHaveLength(0);
  });

  it('should apply link to partial text range', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const result = applyOperation(doc, {
      type: 'add_mark', path: [0], offset: 6, length: 5,
      mark: { type: 'link', attrs: { href: 'https://world.com' } },
    });
    // "Hello " should have no link
    expect(getMarksAt(result, 0, 0)).toHaveLength(0);
    // "World" should have link
    const worldMarks = getMarksAt(result, 0, 7);
    expect(worldMarks).toHaveLength(1);
    expect(worldMarks[0].type).toBe('link');
  });

  it('should replace existing link with new href', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Click',
      marks: [{ type: 'link', attrs: { href: 'https://old.com' } }],
    }]);
    // Remove old, add new
    let result = applyOperation(doc, {
      type: 'remove_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'link' },
    });
    result = applyOperation(result, {
      type: 'add_mark', path: [0], offset: 0, length: 5,
      mark: { type: 'link', attrs: { href: 'https://new.com' } },
    });
    const marks = getMarksAt(result, 0, 0);
    expect(marks).toHaveLength(1);
    expect(marks[0].attrs?.href).toBe('https://new.com');
  });

  it('should preserve link mark across text operations', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Link',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    }]);
    // Insert text into linked node
    const result = applyOperation(doc, {
      type: 'insert_text', path: [0, 0], offset: 4, data: 'ed',
    });
    expect(getBlockText(result, 0)).toBe('Linked');
    const marks = getMarksAt(result, 0, 0);
    expect(marks[0].type).toBe('link');
  });
});
