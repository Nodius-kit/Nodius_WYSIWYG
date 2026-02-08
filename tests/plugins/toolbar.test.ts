import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { toolbarPlugin } from '../../src/plugins/toolbar';

describe('Toolbar Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should render toolbar element', () => {
    const editor = createEditor({ plugins: [boldPlugin, italicPlugin, toolbarPlugin] });
    editor.mount(container);
    expect(container.querySelector('.nodius-toolbar')).not.toBeNull();
    editor.destroy();
  });

  it('should render buttons for each toolbar item', () => {
    const editor = createEditor({ plugins: [boldPlugin, italicPlugin, toolbarPlugin] });
    editor.mount(container);
    const buttons = container.querySelectorAll('.nodius-toolbar-btn');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    editor.destroy();
  });

  it('should inject default CSS', () => {
    const editor = createEditor({ plugins: [toolbarPlugin] });
    editor.mount(container);
    const style = document.querySelector('style[data-nodius]');
    expect(style).not.toBeNull();
    editor.destroy();
  });

  it('should not inject CSS twice', () => {
    const editor1 = createEditor({ plugins: [toolbarPlugin] });
    editor1.mount(container);
    const editor2 = createEditor({ plugins: [toolbarPlugin] });
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    editor2.mount(container2);

    const styles = document.querySelectorAll('style[data-nodius]');
    expect(styles.length).toBe(1);

    editor1.destroy();
    editor2.destroy();
    document.body.removeChild(container2);
  });

  it('should remove toolbar on destroy', () => {
    const editor = createEditor({ plugins: [boldPlugin, toolbarPlugin] });
    editor.mount(container);
    expect(container.querySelector('.nodius-toolbar')).not.toBeNull();
    editor.destroy();
    expect(container.querySelector('.nodius-toolbar')).toBeNull();
  });

  describe('Configurable toolbar layout', () => {
    it('should render only specified items when toolbar config is provided', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin, toolbarPlugin],
        toolbar: ['bold', 'italic'],
      });
      editor.mount(container);
      const buttons = container.querySelectorAll('.nodius-toolbar-btn');
      expect(buttons.length).toBe(2);
      editor.destroy();
    });

    it('should respect configured order', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin, toolbarPlugin],
        toolbar: ['italic', 'bold'],
      });
      editor.mount(container);
      const buttons = container.querySelectorAll('.nodius-toolbar-btn');
      expect(buttons.length).toBe(2);
      expect(buttons[0].getAttribute('data-command')).toBe('toggle-italic');
      expect(buttons[1].getAttribute('data-command')).toBe('toggle-bold');
      editor.destroy();
    });

    it('should render separators from toolbar config', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin, toolbarPlugin],
        toolbar: ['bold', '|', 'italic'],
      });
      editor.mount(container);
      const buttons = container.querySelectorAll('.nodius-toolbar-btn');
      const separators = container.querySelectorAll('.nodius-toolbar-sep');
      expect(buttons.length).toBe(2);
      expect(separators.length).toBe(1);
      editor.destroy();
    });

    it('should skip unknown item names', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin, toolbarPlugin],
        toolbar: ['bold', 'nonexistent'],
      });
      editor.mount(container);
      const buttons = container.querySelectorAll('.nodius-toolbar-btn');
      expect(buttons.length).toBe(1);
      editor.destroy();
    });

    it('should fall back to default behavior when no toolbar config', () => {
      const editor = createEditor({
        plugins: [boldPlugin, italicPlugin, toolbarPlugin],
      });
      editor.mount(container);
      const buttons = container.querySelectorAll('.nodius-toolbar-btn');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      editor.destroy();
    });
  });
});
