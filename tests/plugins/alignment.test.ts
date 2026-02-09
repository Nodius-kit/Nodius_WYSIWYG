import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { alignmentPlugin } from '../../src/plugins/alignment';
import { horizontalRulePlugin } from '../../src/plugins/horizontal-rule';
import { createDocWith } from '../helpers';

describe('Alignment Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register alignment commands', () => {
    const editor = createEditor({ plugins: [alignmentPlugin] });
    const commands = (editor as any).getCommands();
    expect(commands.has('set-alignment')).toBe(true);
    expect(commands.has('align-left')).toBe(true);
    expect(commands.has('align-center')).toBe(true);
    expect(commands.has('align-right')).toBe(true);
    expect(commands.has('align-justify')).toBe(true);
  });

  it('should set text alignment to center', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Centered' }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('align-center');

    const block = editor.getDoc().children[0];
    expect(block.attrs.textAlign).toBe('center');
    editor.destroy();
  });

  it('should set text alignment to right', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Right aligned' }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('align-right');

    const block = editor.getDoc().children[0];
    expect(block.attrs.textAlign).toBe('right');
    editor.destroy();
  });

  it('should set text alignment to justify', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Justified' }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('align-justify');

    const block = editor.getDoc().children[0];
    expect(block.attrs.textAlign).toBe('justify');
    editor.destroy();
  });

  it('should reset alignment to left (removes textAlign attr)', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Reset', attrs: { textAlign: 'center' } }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('align-left');

    const block = editor.getDoc().children[0];
    expect(block.attrs.textAlign).toBeUndefined();
    editor.destroy();
  });

  it('should use set-alignment command with args', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Args test' }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('set-alignment', { alignment: 'right' });

    const block = editor.getDoc().children[0];
    expect(block.attrs.textAlign).toBe('right');
    editor.destroy();
  });

  it('should return false with no selection', () => {
    const editor = createEditor({ plugins: [alignmentPlugin] });
    const result = editor.executeCommand('align-center');
    expect(result).toBe(false);
  });

  it('should not affect void blocks', () => {
    const doc = createDocWith([{ type: 'horizontal_rule' }]);
    const editor = createEditor({ plugins: [alignmentPlugin, horizontalRulePlugin], initialContent: doc });
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

    const result = editor.executeCommand('align-center');
    expect(result).toBe(false);
    editor.destroy();
  });

  it('should have 4 toolbar items', () => {
    expect(alignmentPlugin.toolbarItems).toHaveLength(4);
    const names = alignmentPlugin.toolbarItems!.map((t) => t.name);
    expect(names).toEqual(['align-left', 'align-center', 'align-right', 'align-justify']);
  });

  it('should correctly detect active alignment', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Test', attrs: { textAlign: 'center' } }]);
    const state = {
      doc,
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 0 },
      },
    };

    const centerItem = alignmentPlugin.toolbarItems!.find((t) => t.name === 'align-center')!;
    const leftItem = alignmentPlugin.toolbarItems!.find((t) => t.name === 'align-left')!;
    expect(centerItem.isActive!(state)).toBe(true);
    expect(leftItem.isActive!(state)).toBe(false);
  });

  it('should change alignment from center to right', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Switch', attrs: { textAlign: 'center' } }]);
    const editor = createEditor({ plugins: [alignmentPlugin], initialContent: doc });
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

    editor.executeCommand('align-right');
    expect(editor.getDoc().children[0].attrs.textAlign).toBe('right');
    editor.destroy();
  });
});
