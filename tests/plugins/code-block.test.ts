import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { codeBlockPlugin } from '../../src/plugins/code-block';
import { createDocWith, getBlockText } from '../helpers';

describe('Code Block Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-code-block command', () => {
    const editor = createEditor({ plugins: [codeBlockPlugin] });
    expect((editor as any).getCommands().has('toggle-code-block')).toBe(true);
  });

  it('should convert paragraph to code block', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'const x = 1;' }]);
    const editor = createEditor({ plugins: [codeBlockPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-code-block');

    expect(editor.getDoc().children[0].type).toBe('code_block');
    expect(getBlockText(editor.getDoc(), 0)).toBe('const x = 1;');
    editor.destroy();
  });

  it('should convert code block back to paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'code' }]);
    const editor = createEditor({ plugins: [codeBlockPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-code-block');
    expect(editor.getDoc().children[0].type).toBe('code_block');

    editor.executeCommand('toggle-code-block');
    expect(editor.getDoc().children[0].type).toBe('paragraph');
    editor.destroy();
  });

  it('should set language attribute', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'function() {}' }]);
    const editor = createEditor({ plugins: [codeBlockPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-code-block', { language: 'javascript' });

    const block = editor.getDoc().children[0];
    expect(block.type).toBe('code_block');
    expect(block.attrs.language).toBe('javascript');
    editor.destroy();
  });

  it('should default to empty language', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'plain code' }]);
    const editor = createEditor({ plugins: [codeBlockPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-code-block');

    const block = editor.getDoc().children[0];
    expect(block.attrs.language).toBe('');
    editor.destroy();
  });

  it('should produce <pre><code> in toDOM', () => {
    const nodeType = codeBlockPlugin.nodeTypes![0];
    const domSpec = nodeType.toDOM({
      id: 'x', kind: 'element', type: 'code_block',
      attrs: { language: 'python' }, children: [],
    });
    expect(domSpec).toEqual(['pre', {}, ['code', { class: 'language-python' }]]);
  });

  it('should produce <pre><code> without class when no language', () => {
    const nodeType = codeBlockPlugin.nodeTypes![0];
    const domSpec = nodeType.toDOM({
      id: 'x', kind: 'element', type: 'code_block',
      attrs: { language: '' }, children: [],
    });
    expect(domSpec).toEqual(['pre', {}, ['code', {}]]);
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [codeBlockPlugin] });
    const result = editor.executeCommand('toggle-code-block');
    expect(result).toBe(false);
  });

  it('should have toolbar item spec', () => {
    expect(codeBlockPlugin.toolbarItems).toHaveLength(1);
    expect(codeBlockPlugin.toolbarItems![0].command).toBe('toggle-code-block');
  });

  it('should have parseDOM for <pre> tag', () => {
    const nodeType = codeBlockPlugin.nodeTypes![0];
    expect(nodeType.parseDOM).toHaveLength(1);
    expect(nodeType.parseDOM![0].tag).toBe('pre');
  });

  it('should preserve text through toggle cycle', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'my code' }]);
    const editor = createEditor({ plugins: [codeBlockPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-code-block');
    editor.executeCommand('toggle-code-block');
    expect(getBlockText(editor.getDoc(), 0)).toBe('my code');
    editor.destroy();
  });
});
