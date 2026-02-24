import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createPdfExportPlugin } from '../../src/plugins/pdf-export';
import { boldPlugin } from '../../src/plugins/bold';
import { createDocWith } from '../helpers';

describe('PDF Export Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register export-pdf command', () => {
    const plugin = createPdfExportPlugin();
    const editor = createEditor({ plugins: [boldPlugin, plugin] });
    expect((editor as any).getCommands().has('export-pdf')).toBe(true);
  });

  it('should have toolbar item spec', () => {
    const plugin = createPdfExportPlugin();
    expect(plugin.toolbarItems).toHaveLength(1);
    expect(plugin.toolbarItems![0].command).toBe('export-pdf');
    expect(plugin.toolbarItems![0].name).toBe('pdf-export');
  });

  it('should call exportFn callback with HTML when provided', async () => {
    const htmlReceived: string[] = [];
    const plugin = createPdfExportPlugin({
      exportFn: async (html: string) => {
        htmlReceived.push(html);
        return new Blob([html], { type: 'text/html' });
      },
    });
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello PDF' }]);
    const editor = createEditor({ plugins: [boldPlugin, plugin], initialContent: doc });
    editor.mount(container);

    const result = editor.executeCommand('export-pdf');
    expect(result).toBe(true);

    // Wait for async exportFn
    await new Promise((r) => setTimeout(r, 50));

    expect(htmlReceived).toHaveLength(1);
    expect(htmlReceived[0]).toContain('Hello PDF');
    expect(htmlReceived[0]).toContain('<p');

    editor.destroy();
  });

  it('should generate correct HTML from document', async () => {
    const htmlReceived: string[] = [];
    const plugin = createPdfExportPlugin({
      exportFn: async (html: string) => {
        htmlReceived.push(html);
        return new Blob([html]);
      },
    });
    const doc = createDocWith([
      { type: 'paragraph', text: 'First paragraph' },
      { type: 'paragraph', text: 'Second paragraph' },
    ]);
    const editor = createEditor({ plugins: [boldPlugin, plugin], initialContent: doc });
    editor.mount(container);

    editor.executeCommand('export-pdf');
    await new Promise((r) => setTimeout(r, 50));

    expect(htmlReceived[0]).toContain('First paragraph');
    expect(htmlReceived[0]).toContain('Second paragraph');

    editor.destroy();
  });

  it('should accept custom styles config', () => {
    const plugin = createPdfExportPlugin({ styles: 'body { color: red; }' });
    expect(plugin.name).toBe('pdf-export');
  });

  it('should accept custom filename config', () => {
    const plugin = createPdfExportPlugin({ filename: 'my-doc' });
    expect(plugin.name).toBe('pdf-export');
  });
});
