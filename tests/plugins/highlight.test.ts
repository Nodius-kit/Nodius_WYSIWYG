import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { highlightPlugin, createHighlightPlugin } from '../../src/plugins/highlight';
import { createDocWith, getMarksAt } from '../helpers';

describe('Highlight Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-highlight command', () => {
    const editor = createEditor({ plugins: [highlightPlugin] });
    expect((editor as any).getCommands().has('toggle-highlight')).toBe(true);
  });

  it('should add highlight mark to selection (default yellow)', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Important text' }]);
    const editor = createEditor({ plugins: [highlightPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-highlight');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'highlight')).toBe(true);
    editor.destroy();
  });

  it('should remove highlight mark when toggled again', () => {
    const doc = createDocWith([{
      type: 'paragraph', text: 'Highlighted',
      marks: [{ type: 'highlight', attrs: { color: 'yellow' } }],
    }]);
    const editor = createEditor({ plugins: [highlightPlugin], initialContent: doc });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 11 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-highlight');

    const marks = getMarksAt(editor.getDoc(), 0, 0);
    expect(marks.some((m) => m.type === 'highlight')).toBe(false);
    editor.destroy();
  });

  it('should produce <mark> with background-color style in toDOM', () => {
    const markType = highlightPlugin.markTypes![0];
    const domSpec = markType.toDOM({ type: 'highlight', attrs: { color: 'lime' } });
    expect(domSpec).toEqual(['mark', { style: 'background-color: lime' }]);
  });

  it('should default to yellow when no color attr', () => {
    const markType = highlightPlugin.markTypes![0];
    const domSpec = markType.toDOM({ type: 'highlight' });
    expect(domSpec).toEqual(['mark', { style: 'background-color: yellow' }]);
  });

  it('should have attrs with color default', () => {
    const markType = highlightPlugin.markTypes![0];
    expect(markType.attrs).toEqual({ color: { default: 'yellow' } });
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [highlightPlugin] });
    const result = editor.executeCommand('toggle-highlight');
    expect(result).toBe(false);
  });

  it('should have toolbar item spec', () => {
    expect(highlightPlugin.toolbarItems).toHaveLength(1);
    expect(highlightPlugin.toolbarItems![0].command).toBe('toggle-highlight');
  });

  it('should have parseDOM rule for <mark> tag', () => {
    const markType = highlightPlugin.markTypes![0];
    expect(markType.parseDOM).toHaveLength(1);
    expect(markType.parseDOM![0].tag).toBe('mark');
  });

  describe('Factory (createHighlightPlugin)', () => {
    it('should create a working plugin with default config', () => {
      const plugin = createHighlightPlugin();
      expect(plugin.name).toBe('highlight');
      expect(plugin.markTypes).toHaveLength(1);
      expect(plugin.toolbarItems).toHaveLength(1);
    });

    it('should accept custom colors', () => {
      const plugin = createHighlightPlugin({ colors: ['#FF0000', '#00FF00'] });
      expect(plugin.name).toBe('highlight');
      expect(plugin.toolbarItems![0].dropdown).toBeDefined();
    });

    it('should have dropdown in toolbar item', () => {
      const plugin = createHighlightPlugin();
      expect(plugin.toolbarItems![0].dropdown).toBeDefined();
    });

    it('should register same commands as static plugin', () => {
      const plugin = createHighlightPlugin();
      const editor = createEditor({ plugins: [plugin] });
      expect((editor as any).getCommands().has('toggle-highlight')).toBe(true);
    });

    it('static export should be equivalent to createHighlightPlugin()', () => {
      expect(highlightPlugin.name).toBe('highlight');
      expect(highlightPlugin.markTypes).toHaveLength(1);
      expect(highlightPlugin.toolbarItems).toHaveLength(1);
    });
  });
});
