import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { strikethroughPlugin } from '../../src/plugins/strikethrough';
import { createDocWith, getMarksAt } from '../helpers';

describe('Strikethrough Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-strikethrough command', () => {
    const editor = createEditor({ plugins: [strikethroughPlugin] });
    expect((editor as any).getCommands().has('toggle-strikethrough')).toBe(true);
  });

  it('should add strikethrough mark to selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({ plugins: [strikethroughPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 5 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-strikethrough');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'strikethrough')).toBe(true);
    const marksRest = getMarksAt(editor.getDoc(), 0, 6);
    expect(marksRest.some((m) => m.type === 'strikethrough')).toBe(false);
    editor.destroy();
  });

  it('should remove strikethrough mark when toggled again', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Deleted Text',
      marks: [{ type: 'strikethrough' }],
    }]);
    const editor = createEditor({ plugins: [strikethroughPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 12 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-strikethrough');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'strikethrough')).toBe(false);
    editor.destroy();
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [strikethroughPlugin] });
    const result = editor.executeCommand('toggle-strikethrough');
    expect(result).toBe(false);
  });

  it('should return false with collapsed selection', () => {
    const editor = createEditor({ plugins: [strikethroughPlugin] });
    editor.mount(container);
    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 0 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });
    const result = editor.executeCommand('toggle-strikethrough');
    expect(result).toBe(false);
    editor.destroy();
  });

  it('should have toolbar item spec', () => {
    expect(strikethroughPlugin.toolbarItems).toHaveLength(1);
    expect(strikethroughPlugin.toolbarItems![0].command).toBe('toggle-strikethrough');
  });

  it('should have markType with parseDOM for s, del, and strike tags', () => {
    expect(strikethroughPlugin.markTypes).toHaveLength(1);
    const markType = strikethroughPlugin.markTypes![0];
    expect(markType.name).toBe('strikethrough');
    expect(markType.parseDOM).toHaveLength(3);
  });

  it('should produce <s> tag in toDOM', () => {
    const markType = strikethroughPlugin.markTypes![0];
    const domSpec = markType.toDOM({ type: 'strikethrough' });
    expect(domSpec).toEqual(['s', {}]);
  });
});
