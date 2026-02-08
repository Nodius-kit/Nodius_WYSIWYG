import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createImageBase64Plugin } from '../../src/plugins/image-base64';
import { createImageRemotePlugin } from '../../src/plugins/image-remote';
import { generateId } from '../../src/core/types';
import type { ElementNode, Document } from '../../src/core/types';

describe('Image Base64 Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register image node type', () => {
    const plugin = createImageBase64Plugin();
    expect(plugin.nodeTypes).toHaveLength(1);
    expect(plugin.nodeTypes![0].name).toBe('image');
    expect(plugin.nodeTypes![0].group).toBe('void');
  });

  it('should register insert-image-base64 command', () => {
    const editor = createEditor({ plugins: [createImageBase64Plugin()] });
    expect((editor as any).getCommands().has('insert-image-base64')).toBe(true);
  });

  it('should have toolbar items', () => {
    const plugin = createImageBase64Plugin();
    expect(plugin.toolbarItems!.length).toBeGreaterThanOrEqual(1);
    expect(plugin.toolbarItems![0].command).toBe('insert-image-base64');
  });

  it('should render image as void block', () => {
    const doc: Document = {
      id: generateId(),
      kind: 'document',
      version: 0,
      children: [
        {
          id: generateId(), kind: 'element', type: 'image',
          attrs: { src: 'data:image/png;base64,abc123', alt: 'test' },
          children: [],
        },
      ],
    };

    const editor = createEditor({ plugins: [createImageBase64Plugin()], initialContent: doc });
    editor.mount(container);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('data:image/png;base64,abc123');
    editor.destroy();
  });
});

describe('Image Remote Plugin', () => {
  it('should depend on image-base64', () => {
    const plugin = createImageRemotePlugin({ uploadFn: async () => '' });
    expect(plugin.dependencies).toContain('image-base64');
  });

  it('should register insert-image-remote command', () => {
    const base = createImageBase64Plugin();
    const remote = createImageRemotePlugin({ uploadFn: async () => 'https://example.com/img.png' });
    const editor = createEditor({ plugins: [base, remote] });
    expect((editor as any).getCommands().has('insert-image-remote')).toBe(true);
  });

  it('should have toolbar item', () => {
    const plugin = createImageRemotePlugin({ uploadFn: async () => '' });
    expect(plugin.toolbarItems).toHaveLength(1);
    expect(plugin.toolbarItems![0].command).toBe('insert-image-remote');
  });
});
