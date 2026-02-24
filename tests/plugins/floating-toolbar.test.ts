import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createFloatingToolbarPlugin } from '../../src/plugins/floating-toolbar';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { createDocWith } from '../helpers';

describe('Floating Toolbar Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should create plugin with default config', () => {
    const plugin = createFloatingToolbarPlugin();
    expect(plugin.name).toBe('floating-toolbar');
  });

  it('should create plugin with custom items config', () => {
    const plugin = createFloatingToolbarPlugin({ items: ['bold', 'italic'] });
    expect(plugin.name).toBe('floating-toolbar');
  });

  it('should create plugin with custom offset', () => {
    const plugin = createFloatingToolbarPlugin({ offset: 12 });
    expect(plugin.name).toBe('floating-toolbar');
  });

  it('should initialize and destroy without error', () => {
    const plugin = createFloatingToolbarPlugin();
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({
      plugins: [boldPlugin, italicPlugin, plugin],
      initialContent: doc,
    });
    editor.mount(container);

    // Toolbar should be hidden (no selection range)
    const floating = container.querySelector('.nodius-floating-toolbar');
    if (floating) {
      expect((floating as HTMLElement).style.display).toBe('none');
    }

    editor.destroy();
  });

  it('should not show toolbar on collapsed selection', () => {
    const plugin = createFloatingToolbarPlugin();
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const editor = createEditor({
      plugins: [boldPlugin, italicPlugin, plugin],
      initialContent: doc,
    });
    editor.mount(container);

    editor.dispatch({
      operations: [],
      selection: {
        anchor: { blockIndex: 0, path: [], offset: 3 },
        focus: { blockIndex: 0, path: [], offset: 3 },
      },
      origin: 'test',
      timestamp: Date.now(),
    });

    // Floating toolbar should remain hidden for collapsed selection
    const floating = container.querySelector('.nodius-floating-toolbar');
    if (floating) {
      expect((floating as HTMLElement).style.display).toBe('none');
    }

    editor.destroy();
  });
});
