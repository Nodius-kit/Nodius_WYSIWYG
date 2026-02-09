import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { subscriptPlugin } from '../../src/plugins/subscript';
import { superscriptPlugin } from '../../src/plugins/superscript';
import { createDocWith, getMarksAt } from '../helpers';

describe('Subscript Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-subscript command', () => {
    const editor = createEditor({ plugins: [subscriptPlugin] });
    expect((editor as any).getCommands().has('toggle-subscript')).toBe(true);
  });

  it('should add subscript mark to selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'H2O' }]);
    const editor = createEditor({ plugins: [subscriptPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-subscript');

    const marks = getMarksAt(editor.getDoc(), 0, 1);
    expect(marks.some((m) => m.type === 'subscript')).toBe(true);
    editor.destroy();
  });

  it('should remove subscript mark when toggled again', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: '2',
      marks: [{ type: 'subscript' }],
    }]);
    const editor = createEditor({ plugins: [subscriptPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-subscript');
    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'subscript')).toBe(false);
    editor.destroy();
  });

  it('should produce <sub> tag in toDOM', () => {
    const markType = subscriptPlugin.markTypes![0];
    const domSpec = markType.toDOM({ type: 'subscript' });
    expect(domSpec).toEqual(['sub', {}]);
  });

  it('should remove superscript when adding subscript (mutual exclusivity)', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Text',
      marks: [{ type: 'superscript' }],
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

    editor.executeCommand('toggle-subscript');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'subscript')).toBe(true);
    expect(marks.some((m) => m.type === 'superscript')).toBe(false);
    editor.destroy();
  });

  it('should have toolbar item spec', () => {
    expect(subscriptPlugin.toolbarItems).toHaveLength(1);
    expect(subscriptPlugin.toolbarItems![0].command).toBe('toggle-subscript');
  });
});
