import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreEditor, createEditor } from '../../src/core/editor';
import { createHistoryPlugin } from '../../src/core/history';
import type { PluginDefinition } from '../../src/core/types';
import { createDocWith, getBlockText } from '../helpers';

describe('CoreEditor', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  });

  describe('construction', () => {
    it('should create with default empty state', () => {
      const editor = createEditor();
      expect(editor.getDoc().children).toHaveLength(1);
      expect(editor.getSelection()).toBeNull();
    });

    it('should create with initial content', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const editor = createEditor({ initialContent: doc });
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');
    });
  });

  describe('mount/destroy', () => {
    it('should mount to container', () => {
      const editor = createEditor();
      editor.mount(container);
      expect(editor.getRootElement()).not.toBeNull();
      expect(editor.getEditableElement()).not.toBeNull();
      expect(container.querySelector('.nodius-editor')).not.toBeNull();
      expect(container.querySelector('.nodius-editable')).not.toBeNull();
      editor.destroy();
    });

    it('should render content on mount', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Visible' }]);
      const editor = createEditor({ initialContent: doc });
      editor.mount(container);
      expect(editor.getEditableElement()!.textContent).toBe('Visible');
      editor.destroy();
    });

    it('should set contenteditable', () => {
      const editor = createEditor();
      editor.mount(container);
      expect(editor.getEditableElement()!.contentEditable).toBe('true');
      editor.destroy();
    });

    it('should set contenteditable=false when readOnly', () => {
      const editor = createEditor({ readOnly: true });
      editor.mount(container);
      expect(editor.getEditableElement()!.contentEditable).toBe('false');
      editor.destroy();
    });

    it('should throw when mounting twice', () => {
      const editor = createEditor();
      editor.mount(container);
      expect(() => editor.mount(container)).toThrow('already mounted');
      editor.destroy();
    });

    it('should clean up DOM on destroy', () => {
      const editor = createEditor();
      editor.mount(container);
      editor.destroy();
      expect(container.querySelector('.nodius-editor')).toBeNull();
      expect(editor.getRootElement()).toBeNull();
    });

    it('should emit destroy event', () => {
      const editor = createEditor();
      const handler = vi.fn();
      editor.on('destroy', handler);
      editor.mount(container);
      editor.destroy();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('should apply operations to state', () => {
      const editor = createEditor();
      editor.mount(container);

      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'Hello' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');
      editor.destroy();
    });

    it('should update DOM after dispatch', () => {
      const editor = createEditor();
      editor.mount(container);

      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'Rendered' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(editor.getEditableElement()!.textContent).toBe('Rendered');
      editor.destroy();
    });

    it('should emit state:change event', () => {
      const editor = createEditor();
      const handler = vi.fn();
      editor.on('state:change', handler);
      editor.mount(container);

      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledOnce();
      editor.destroy();
    });

    it('should reject transaction when plugin returns null', () => {
      const blockingPlugin: PluginDefinition = {
        name: 'blocker',
        onTransaction: () => null,
      };
      const editor = createEditor({ plugins: [blockingPlugin] });
      editor.mount(container);

      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'Blocked' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(getBlockText(editor.getDoc(), 0)).toBe('');
      editor.destroy();
    });
  });

  describe('commands', () => {
    it('should execute registered commands', () => {
      const myPlugin: PluginDefinition = {
        name: 'test-plugin',
        init(ctx) {
          ctx.commands.register('do-something', (editor) => {
            editor.dispatch({
              operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'Done' }],
              origin: 'command',
              timestamp: Date.now(),
            });
            return true;
          });
        },
      };
      const editor = createEditor({ plugins: [myPlugin] });
      editor.mount(container);

      const result = editor.executeCommand('do-something');
      expect(result).toBe(true);
      expect(getBlockText(editor.getDoc(), 0)).toBe('Done');
      editor.destroy();
    });

    it('should return false for unknown commands', () => {
      const editor = createEditor();
      expect(editor.executeCommand('nonexistent')).toBe(false);
    });
  });

  describe('plugins', () => {
    it('should initialize plugins in dependency order', () => {
      const order: string[] = [];
      const a: PluginDefinition = { name: 'a', init: () => { order.push('a'); } };
      const b: PluginDefinition = { name: 'b', dependencies: ['a'], init: () => { order.push('b'); } };

      createEditor({ plugins: [b, a] });
      expect(order).toEqual(['a', 'b']);
    });

    it('should call onUpdate after state change', () => {
      const onUpdate = vi.fn();
      const plugin: PluginDefinition = { name: 'watcher', onUpdate };
      const editor = createEditor({ plugins: [plugin] });
      editor.mount(container);

      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(onUpdate).toHaveBeenCalled();
      editor.destroy();
    });
  });

  describe('history integration', () => {
    it('should undo/redo via commands', () => {
      const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
      const editor = createEditor({ plugins: [plugin] });
      editor.mount(container);

      // Type something
      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'Hello' }],
        origin: 'input',
        timestamp: Date.now(),
      });
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');

      // Undo
      editor.executeCommand('undo');
      expect(getBlockText(editor.getDoc(), 0)).toBe('');

      // Redo
      editor.executeCommand('redo');
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello');

      editor.destroy();
    });
  });
});
