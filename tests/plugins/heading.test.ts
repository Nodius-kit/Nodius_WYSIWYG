import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { headingPlugin } from '../../src/plugins/heading';
import { createDocWith } from '../helpers';

describe('Heading Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should set paragraph to heading', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Title' }]);
    const editor = createEditor({ plugins: [headingPlugin], initialContent: doc });
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

    editor.executeCommand('set-heading', { level: 2 });
    expect(editor.getDoc().children[0].type).toBe('heading');
    expect(editor.getDoc().children[0].attrs.level).toBe(2);
    editor.destroy();
  });

  it('should toggle heading back to paragraph', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 2 } }]);
    const editor = createEditor({ plugins: [headingPlugin], initialContent: doc });
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

    editor.executeCommand('set-heading', { level: 2 });
    expect(editor.getDoc().children[0].type).toBe('paragraph');
    editor.destroy();
  });

  it('should change heading level', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
    const editor = createEditor({ plugins: [headingPlugin], initialContent: doc });
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

    editor.executeCommand('set-heading', { level: 3 });
    expect(editor.getDoc().children[0].type).toBe('heading');
    expect(editor.getDoc().children[0].attrs.level).toBe(3);
    editor.destroy();
  });

  it('should have toolbar items for H1-H3', () => {
    expect(headingPlugin.toolbarItems).toHaveLength(3);
  });
});
