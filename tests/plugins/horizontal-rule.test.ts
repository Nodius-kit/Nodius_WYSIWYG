import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { horizontalRulePlugin } from '../../src/plugins/horizontal-rule';
import { createDocWith, getBlockText } from '../helpers';

describe('Horizontal Rule Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register insert-hr command', () => {
    const editor = createEditor({ plugins: [horizontalRulePlugin] });
    expect((editor as any).getCommands().has('insert-hr')).toBe(true);
  });

  it('should insert HR after current block', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Before' }]);
    const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
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

    editor.executeCommand('insert-hr');

    const doc2 = editor.getDoc();
    expect(doc2.children).toHaveLength(3);
    expect(doc2.children[0].type).toBe('paragraph');
    expect(doc2.children[1].type).toBe('horizontal_rule');
    expect(doc2.children[2].type).toBe('paragraph');
    expect(getBlockText(doc2, 0)).toBe('Before');
    editor.destroy();
  });

  it('should create empty paragraph after HR', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Content' }]);
    const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
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

    editor.executeCommand('insert-hr');

    const doc2 = editor.getDoc();
    const lastBlock = doc2.children[2];
    expect(lastBlock.type).toBe('paragraph');
    expect(getBlockText(doc2, 2)).toBe('');
    editor.destroy();
  });

  it('should move selection to new paragraph after HR', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Text' }]);
    const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
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

    editor.executeCommand('insert-hr');

    const sel = editor.getState().selection;
    expect(sel?.anchor.blockIndex).toBe(2);
    expect(sel?.anchor.offset).toBe(0);
    editor.destroy();
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [horizontalRulePlugin] });
    const result = editor.executeCommand('insert-hr');
    expect(result).toBe(false);
  });

  it('should have void nodeType', () => {
    expect(horizontalRulePlugin.nodeTypes).toHaveLength(1);
    expect(horizontalRulePlugin.nodeTypes![0].name).toBe('horizontal_rule');
    expect(horizontalRulePlugin.nodeTypes![0].group).toBe('void');
  });

  it('should produce <hr> in toDOM', () => {
    const nodeType = horizontalRulePlugin.nodeTypes![0];
    const domSpec = nodeType.toDOM({ id: 'x', kind: 'element', type: 'horizontal_rule', attrs: {}, children: [] });
    expect(domSpec).toEqual(['hr', {}]);
  });

  it('should have parseDOM for <hr>', () => {
    const nodeType = horizontalRulePlugin.nodeTypes![0];
    expect(nodeType.parseDOM).toHaveLength(1);
    expect(nodeType.parseDOM![0].tag).toBe('hr');
  });

  it('should have toolbar item spec', () => {
    expect(horizontalRulePlugin.toolbarItems).toHaveLength(1);
    expect(horizontalRulePlugin.toolbarItems![0].command).toBe('insert-hr');
  });

  it('should insert HR between existing blocks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);
    const editor = createEditor({ plugins: [horizontalRulePlugin], initialContent: doc });
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

    editor.executeCommand('insert-hr');

    const doc2 = editor.getDoc();
    expect(doc2.children).toHaveLength(4);
    expect(doc2.children[0].type).toBe('paragraph');
    expect(doc2.children[1].type).toBe('horizontal_rule');
    expect(doc2.children[2].type).toBe('paragraph');
    expect(doc2.children[3].type).toBe('paragraph');
    expect(getBlockText(doc2, 3)).toBe('Second');
    editor.destroy();
  });
});
