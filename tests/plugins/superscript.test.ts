import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { superscriptPlugin } from '../../src/plugins/superscript';
import { subscriptPlugin } from '../../src/plugins/subscript';
import { createDocWith, getMarksAt } from '../helpers';

describe('Superscript Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-superscript command', () => {
    const editor = createEditor({ plugins: [superscriptPlugin] });
    expect((editor as any).getCommands().has('toggle-superscript')).toBe(true);
  });

  it('should add superscript mark to selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'x2' }]);
    const editor = createEditor({ plugins: [superscriptPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 1 },
        focus: { blockIndex: 0, path: [], offset: 2 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-superscript');

    const marks = getMarksAt(editor.getDoc(), 0, 1);
    expect(marks.some((m) => m.type === 'superscript')).toBe(true);
    editor.destroy();
  });

  it('should remove superscript mark when toggled again', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: '2',
      marks: [{ type: 'superscript' }],
    }]);
    const editor = createEditor({ plugins: [superscriptPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 1 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-superscript');
    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'superscript')).toBe(false);
    editor.destroy();
  });

  it('should produce <sup> tag in toDOM', () => {
    const markType = superscriptPlugin.markTypes![0];
    const domSpec = markType.toDOM({ type: 'superscript' });
    expect(domSpec).toEqual(['sup', {}]);
  });

  it('should remove subscript when adding superscript (mutual exclusivity)', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Text',
      marks: [{ type: 'subscript' }],
    }]);
    const editor = createEditor({
      plugins: [subscriptPlugin, superscriptPlugin],
      initialContent: doc,
    });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 4 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-superscript');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'superscript')).toBe(true);
    expect(marks.some((m) => m.type === 'subscript')).toBe(false);
    editor.destroy();
  });

  it('should have toolbar item spec', () => {
    expect(superscriptPlugin.toolbarItems).toHaveLength(1);
    expect(superscriptPlugin.toolbarItems![0].command).toBe('toggle-superscript');
  });
});
