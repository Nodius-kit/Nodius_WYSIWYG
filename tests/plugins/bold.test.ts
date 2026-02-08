import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { createDocWith, getMarksAt, getBlockText } from '../helpers';

describe('Bold Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-bold command', () => {
    const editor = createEditor({ plugins: [boldPlugin] });
    expect((editor as any).getCommands().has('toggle-bold')).toBe(true);
  });

  it('should add bold mark to selection', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({ plugins: [boldPlugin], initialContent: doc });
    editor.mount(container);

    // Set selection on "Hello" (0-5)
    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 5 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-bold');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(true);

    // " World" should not be bold
    const marksWorld = getMarksAt(editor.getDoc(), 0, 6);
    expect(marksWorld.some((m) => m.type === 'bold')).toBe(false);

    editor.destroy();
  });

  it('should remove bold mark when toggled again', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Bold Text',
      marks: [{ type: 'bold' }],
    }]);
    const editor = createEditor({ plugins: [boldPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 9 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-bold');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'bold')).toBe(false);
    editor.destroy();
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [boldPlugin] });
    const result = editor.executeCommand('toggle-bold');
    expect(result).toBe(false);
  });

  it('should return false with collapsed selection', () => {
    const editor = createEditor({ plugins: [boldPlugin] });
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
    const result = editor.executeCommand('toggle-bold');
    expect(result).toBe(false);
    editor.destroy();
  });

  it('should have toolbar item spec', () => {
    expect(boldPlugin.toolbarItems).toHaveLength(1);
    expect(boldPlugin.toolbarItems![0].command).toBe('toggle-bold');
  });
});
