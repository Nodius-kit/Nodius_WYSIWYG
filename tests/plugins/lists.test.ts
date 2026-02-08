import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { listsPlugin } from '../../src/plugins/lists';
import { createDocWith, getBlockText } from '../helpers';
import type { ElementNode } from '../../src/core/types';

describe('Lists Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should wrap paragraph in ordered list', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Item' }]);
    const editor = createEditor({ plugins: [listsPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-ordered-list');

    const block = editor.getDoc().children[0];
    expect(block.type).toBe('ordered_list');
    // Should have list_item > paragraph structure
    const listItem = block.children[0] as ElementNode;
    expect(listItem.type).toBe('list_item');
    editor.destroy();
  });

  it('should unwrap ordered list back to paragraph', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Item' }]);
    const editor = createEditor({ plugins: [listsPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-ordered-list');
    expect(editor.getDoc().children[0].type).toBe('ordered_list');

    // Update selection for the new structure
    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 0 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-ordered-list');
    expect(editor.getDoc().children[0].type).toBe('paragraph');
    editor.destroy();
  });

  it('should switch between list types', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Item' }]);
    const editor = createEditor({ plugins: [listsPlugin], initialContent: doc });
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

    editor.executeCommand('toggle-ordered-list');
    expect(editor.getDoc().children[0].type).toBe('ordered_list');

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 0 },
        focus: { blockIndex: 0, path: [], offset: 0 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    editor.executeCommand('toggle-unordered-list');
    expect(editor.getDoc().children[0].type).toBe('unordered_list');
    editor.destroy();
  });

  it('should have toolbar items', () => {
    expect(listsPlugin.toolbarItems).toHaveLength(2);
  });
});
