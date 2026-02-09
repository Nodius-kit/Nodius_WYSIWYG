import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { blockquotePlugin } from '../../src/plugins/blockquote';
import { createDocWith, getBlockText } from '../helpers';

describe('Blockquote Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-blockquote command', () => {
    const editor = createEditor({ plugins: [blockquotePlugin] });
    expect((editor as any).getCommands().has('toggle-blockquote')).toBe(true);
  });

  it('should wrap paragraph in blockquote', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Quote me' }]);
    const editor = createEditor({ plugins: [blockquotePlugin], initialContent: doc });
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

    editor.executeCommand('toggle-blockquote');

    const block = editor.getDoc().children[0];
    expect(block.type).toBe('blockquote');
    expect(block.children).toHaveLength(1);
    expect((block.children[0] as any).type).toBe('paragraph');
    editor.destroy();
  });

  it('should unwrap blockquote back to paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Quoted' }]);
    const editor = createEditor({ plugins: [blockquotePlugin], initialContent: doc });
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

    // Wrap
    editor.executeCommand('toggle-blockquote');
    expect(editor.getDoc().children[0].type).toBe('blockquote');

    // Unwrap
    editor.executeCommand('toggle-blockquote');
    expect(editor.getDoc().children[0].type).toBe('paragraph');
    editor.destroy();
  });

  it('should preserve text content through wrap/unwrap cycle', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Keep my text' }]);
    const editor = createEditor({ plugins: [blockquotePlugin], initialContent: doc });
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

    editor.executeCommand('toggle-blockquote');
    editor.executeCommand('toggle-blockquote');

    expect(getBlockText(editor.getDoc(), 0)).toBe('Keep my text');
    editor.destroy();
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [blockquotePlugin] });
    const result = editor.executeCommand('toggle-blockquote');
    expect(result).toBe(false);
  });

  it('should have nodeType with blockquote spec', () => {
    expect(blockquotePlugin.nodeTypes).toHaveLength(1);
    expect(blockquotePlugin.nodeTypes![0].name).toBe('blockquote');
    expect(blockquotePlugin.nodeTypes![0].group).toBe('block');
  });

  it('should produce <blockquote> in toDOM', () => {
    const nodeType = blockquotePlugin.nodeTypes![0];
    const domSpec = nodeType.toDOM({ id: 'x', kind: 'element', type: 'blockquote', attrs: {}, children: [] });
    expect(domSpec).toEqual(['blockquote', {}]);
  });

  it('should have parseDOM for <blockquote>', () => {
    const nodeType = blockquotePlugin.nodeTypes![0];
    expect(nodeType.parseDOM).toHaveLength(1);
    expect(nodeType.parseDOM![0].tag).toBe('blockquote');
  });

  it('should have toolbar item spec', () => {
    expect(blockquotePlugin.toolbarItems).toHaveLength(1);
    expect(blockquotePlugin.toolbarItems![0].command).toBe('toggle-blockquote');
  });

  it('should not affect other blocks when wrapping', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);
    const editor = createEditor({ plugins: [blockquotePlugin], initialContent: doc });
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

    editor.executeCommand('toggle-blockquote');

    expect(editor.getDoc().children).toHaveLength(2);
    expect(editor.getDoc().children[0].type).toBe('blockquote');
    expect(editor.getDoc().children[1].type).toBe('paragraph');
    expect(getBlockText(editor.getDoc(), 1)).toBe('Second');
    editor.destroy();
  });
});
