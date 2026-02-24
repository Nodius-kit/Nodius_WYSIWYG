import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createTextColorPlugin } from '../../src/plugins/text-color';
import { createDocWith, getMarksAt } from '../helpers';

describe('Text Color Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register set-text-color and remove-text-color commands', () => {
    const plugin = createTextColorPlugin();
    const editor = createEditor({ plugins: [plugin] });
    expect((editor as any).getCommands().has('set-text-color')).toBe(true);
    expect((editor as any).getCommands().has('remove-text-color')).toBe(true);
  });

  it('should add text-color mark with specified color', () => {
    const plugin = createTextColorPlugin();
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({ plugins: [plugin], initialContent: doc });
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

    editor.executeCommand('set-text-color', { color: '#D32F2F' });

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'text-color' && m.attrs?.color === '#D32F2F')).toBe(true);

    const marksWorld = getMarksAt(editor.getDoc(), 0, 6);
    expect(marksWorld.some((m) => m.type === 'text-color')).toBe(false);

    editor.destroy();
  });

  it('should remove text-color mark', () => {
    const plugin = createTextColorPlugin();
    const doc = createDocWith([{
      type: 'paragraph',
      text: 'Colored',
      marks: [{ type: 'text-color', attrs: { color: '#D32F2F' } }],
    }]);
    const editor = createEditor({ plugins: [plugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 7 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('remove-text-color');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'text-color')).toBe(false);

    editor.destroy();
  });

  it('should store text-color in storedMarks on collapsed selection', () => {
    const plugin = createTextColorPlugin();
    const editor = createEditor({ plugins: [plugin] });
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

    editor.executeCommand('set-text-color', { color: '#1976D2' });
    const stored = editor.getState().storedMarks;
    expect(stored).toBeDefined();
    expect(stored!.some((m) => m.type === 'text-color' && m.attrs?.color === '#1976D2')).toBe(true);

    editor.destroy();
  });

  it('should return false when no color is provided', () => {
    const plugin = createTextColorPlugin();
    const editor = createEditor({ plugins: [plugin] });
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

    const result = editor.executeCommand('set-text-color');
    expect(result).toBe(false);
    editor.destroy();
  });

  it('should accept custom color palette', () => {
    const customColors = ['#FF0000', '#00FF00', '#0000FF'];
    const plugin = createTextColorPlugin({ colors: customColors });
    expect(plugin.toolbarItems).toHaveLength(1);
    expect(plugin.toolbarItems![0].name).toBe('text-color');
  });

  it('should have toolbar item spec with dropdown', () => {
    const plugin = createTextColorPlugin();
    expect(plugin.toolbarItems).toHaveLength(1);
    expect(plugin.toolbarItems![0].dropdown).toBeDefined();
  });

  it('should have mark type spec', () => {
    const plugin = createTextColorPlugin();
    expect(plugin.markTypes).toHaveLength(1);
    expect(plugin.markTypes![0].name).toBe('text-color');
  });
});
