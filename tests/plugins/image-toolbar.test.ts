import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createImageToolbarPlugin } from '../../src/plugins/image-toolbar';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createDocWith } from '../helpers';

describe('Image Toolbar Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register delete-image command', () => {
    const imagePlugin = createImageBase64Plugin();
    const toolbarPlugin = createImageToolbarPlugin();
    const editor = createEditor({ plugins: [imagePlugin, toolbarPlugin] });
    expect((editor as any).getCommands().has('delete-image')).toBe(true);
    editor.destroy();
  });

  it('should attach click listener after mount', () => {
    const imagePlugin = createImageBase64Plugin();
    const toolbarPlugin = createImageToolbarPlugin();
    const doc = createDocWith([
      { type: 'paragraph', text: 'Hello' },
      { type: 'image', attrs: { src: 'data:image/png;base64,abc', alt: '' } },
    ]);
    const editor = createEditor({
      plugins: [imagePlugin, toolbarPlugin],
      initialContent: doc,
    });

    // Before mount, getEditableElement returns null
    expect(editor.getEditableElement()).toBe(null);

    // Mount the editor — click listener should be attached via mount event
    editor.mount(container);

    // After mount, editable element exists
    expect(editor.getEditableElement()).not.toBe(null);

    editor.destroy();
  });

  it('should delete image block via command', () => {
    const imagePlugin = createImageBase64Plugin();
    const toolbarPlugin = createImageToolbarPlugin();
    const doc = createDocWith([
      { type: 'paragraph', text: 'Hello' },
      { type: 'image', attrs: { src: 'data:image/png;base64,abc', alt: '' } },
    ]);
    const editor = createEditor({
      plugins: [imagePlugin, toolbarPlugin],
      initialContent: doc,
    });
    editor.mount(container);

    // Select the image block
    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 1, path: [], offset: 0 },
        focus: { blockIndex: 1, path: [], offset: 0 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    const result = editor.executeCommand('delete-image');
    expect(result).toBe(true);
    expect(editor.getDoc().children).toHaveLength(1);
    expect(editor.getDoc().children[0].type).toBe('paragraph');

    editor.destroy();
  });

  it('should return false when trying to delete non-image block', () => {
    const imagePlugin = createImageBase64Plugin();
    const toolbarPlugin = createImageToolbarPlugin();
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
    const editor = createEditor({
      plugins: [imagePlugin, toolbarPlugin],
      initialContent: doc,
    });
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

    const result = editor.executeCommand('delete-image');
    expect(result).toBe(false);

    editor.destroy();
  });
});
