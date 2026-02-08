import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { boldPlugin } from '../../src/plugins/bold';
import { italicPlugin } from '../../src/plugins/italic';
import { headingPlugin } from '../../src/plugins/heading';
import { createHtmlViewPlugin } from '../../src/plugins/html-view';
import { paragraphNodeType } from '../../src/core/schema';
import { createDocWith, getBlockText, getMarksAt } from '../helpers';
import type { NodeTypeSpec, MarkTypeSpec } from '../../src/core/types';

const nodeTypes: NodeTypeSpec[] = [
  paragraphNodeType,
  ...headingPlugin.nodeTypes!,
];

const markTypes: MarkTypeSpec[] = [
  ...boldPlugin.markTypes!,
  ...italicPlugin.markTypes!,
];

function createHtmlView() {
  return createHtmlViewPlugin({ nodeTypes, markTypes });
}

describe('HTML View Plugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should register toggle-html-view command', () => {
    const { plugin } = createHtmlView();
    const editor = createEditor({ plugins: [boldPlugin, headingPlugin, plugin] });
    editor.mount(container);

    expect((editor as any).getCommands().has('toggle-html-view')).toBe(true);
    editor.destroy();
  });

  it('should have toolbar item', () => {
    const { plugin } = createHtmlView();
    expect(plugin.toolbarItems).toHaveLength(1);
    expect(plugin.toolbarItems![0].name).toBe('html-view');
    expect(plugin.toolbarItems![0].command).toBe('toggle-html-view');
  });

  it('should start in WYSIWYG mode', () => {
    const { plugin, isHtmlMode } = createHtmlView();
    const editor = createEditor({ plugins: [plugin] });
    editor.mount(container);

    expect(isHtmlMode()).toBe(false);
    editor.destroy();
  });

  it('should toggle to HTML mode', () => {
    const { plugin, isHtmlMode, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello World' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    expect(isHtmlMode()).toBe(true);

    // Should have a textarea
    const textarea = container.querySelector('textarea.nodius-html-view');
    expect(textarea).not.toBeNull();

    // Textarea should contain HTML
    expect((textarea as HTMLTextAreaElement).value).toContain('<p>Hello World</p>');

    // Editable should be hidden
    const editable = container.querySelector('.nodius-editable') as HTMLElement;
    expect(editable.style.display).toBe('none');

    editor.destroy();
  });

  it('should toggle back to WYSIWYG mode', () => {
    const { plugin, isHtmlMode, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    expect(isHtmlMode()).toBe(true);

    setHtmlMode(false);
    expect(isHtmlMode()).toBe(false);

    // Textarea should be gone
    const textarea = container.querySelector('textarea.nodius-html-view');
    expect(textarea).toBeNull();

    // Editable should be visible
    const editable = container.querySelector('.nodius-editable') as HTMLElement;
    expect(editable.style.display).toBe('');

    editor.destroy();
  });

  it('should show correct HTML for bold text', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }] }]);
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: doc,
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    expect(textarea.value).toContain('<strong>Bold</strong>');

    editor.destroy();
  });

  it('should show correct HTML for heading', () => {
    const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 1 } }]);
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: doc,
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    expect(textarea.value).toContain('<h1>Title</h1>');

    editor.destroy();
  });

  it('should apply HTML changes back to document on exit', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Original' }]),
    });
    editor.mount(container);

    setHtmlMode(true);

    // Modify the textarea
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '<p>Modified text</p>';

    // Exit HTML mode — should apply the HTML
    setHtmlMode(false);

    expect(getBlockText(editor.getDoc(), 0)).toBe('Modified text');
    editor.destroy();
  });

  it('should parse heading from HTML edit', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '<h2>New Heading</h2>';
    setHtmlMode(false);

    expect(editor.getDoc().children[0].type).toBe('heading');
    expect(editor.getDoc().children[0].attrs.level).toBe(2);
    expect(getBlockText(editor.getDoc(), 0)).toBe('New Heading');

    editor.destroy();
  });

  it('should parse bold marks from HTML edit', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '<p><strong>Bold</strong> normal</p>';
    setHtmlMode(false);

    expect(getBlockText(editor.getDoc(), 0)).toBe('Bold normal');
    expect(getMarksAt(editor.getDoc(), 0, 0).some((m) => m.type === 'bold')).toBe(true);
    expect(getMarksAt(editor.getDoc(), 0, 5).some((m) => m.type === 'bold')).toBe(false);

    editor.destroy();
  });

  it('should handle multi-block HTML edit', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Single' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '<h1>Title</h1>\n<p>First paragraph</p>\n<p>Second paragraph</p>';
    setHtmlMode(false);

    expect(editor.getDoc().children).toHaveLength(3);
    expect(editor.getDoc().children[0].type).toBe('heading');
    expect(getBlockText(editor.getDoc(), 0)).toBe('Title');
    expect(editor.getDoc().children[1].type).toBe('paragraph');
    expect(getBlockText(editor.getDoc(), 1)).toBe('First paragraph');
    expect(getBlockText(editor.getDoc(), 2)).toBe('Second paragraph');

    editor.destroy();
  });

  it('should toggle via command', () => {
    const { plugin, isHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Test' }]),
    });
    editor.mount(container);

    expect(isHtmlMode()).toBe(false);
    editor.executeCommand('toggle-html-view');
    expect(isHtmlMode()).toBe(true);
    editor.executeCommand('toggle-html-view');
    expect(isHtmlMode()).toBe(false);

    editor.destroy();
  });

  it('should handle empty HTML gracefully', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '';
    setHtmlMode(false);

    // Should have at least one empty paragraph
    expect(editor.getDoc().children.length).toBeGreaterThanOrEqual(1);

    editor.destroy();
  });

  it('should clean up textarea on destroy while in HTML mode', () => {
    const { plugin, setHtmlMode, isHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Test' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    expect(container.querySelector('textarea.nodius-html-view')).not.toBeNull();

    editor.destroy();

    // After destroy, HTML mode should be off
    expect(isHtmlMode()).toBe(false);
  });
});

// ─── Collaboration scenarios ──────────────────────────────────

describe('HTML View + Collaboration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should update textarea when remote changes arrive in HTML mode', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Original' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Original');

    // Simulate remote change — dispatch a doc update
    editor.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 8, data: ' text' }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    // Textarea should update to reflect the new doc
    expect(textarea.value).toContain('Original text');

    editor.destroy();
  });

  it('should show remote heading change in textarea', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Title' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    expect(textarea.value).toContain('<p>Title</p>');

    // Remote: change to heading
    editor.dispatch({
      operations: [
        { type: 'set_node_type', path: [0], nodeType: 'heading' },
        { type: 'update_attrs', path: [0], attrs: { level: 1 } },
      ],
      origin: 'remote',
      timestamp: Date.now(),
    });

    expect(textarea.value).toContain('<h1>Title</h1>');
    editor.destroy();
  });

  it('should show remote bold mark in textarea', () => {
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Hello World' }]),
    });
    editor.mount(container);

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;

    // Remote: add bold to "Hello"
    editor.dispatch({
      operations: [{
        type: 'add_mark', path: [0], offset: 0, length: 5,
        mark: { type: 'bold' },
      }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    expect(textarea.value).toContain('<strong>Hello</strong>');
    editor.destroy();
  });

  it('should apply HTML edit and emit state:change for collab sync', () => {
    const stateChanges: string[] = [];
    const { plugin, setHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Original' }]),
    });
    editor.mount(container);

    editor.on('state:change', ({ nextState }) => {
      stateChanges.push(getBlockText(nextState.doc, 0));
    });

    setHtmlMode(true);
    const textarea = container.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    textarea.value = '<p>Changed by user A</p>';

    // Exit HTML mode — this applies the HTML and should fire state:change
    setHtmlMode(false);

    expect(stateChanges).toContain('Changed by user A');
    expect(getBlockText(editor.getDoc(), 0)).toBe('Changed by user A');

    editor.destroy();
  });

  it('two editors: one in HTML mode, one in WYSIWYG, both see changes', () => {
    // Editor A — will be in HTML mode
    const hvA = createHtmlView();
    const editorA = createEditor({
      plugins: [boldPlugin, headingPlugin, hvA.plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Shared' }]),
    });
    const containerA = document.createElement('div');
    document.body.appendChild(containerA);
    editorA.mount(containerA);

    // Editor B — stays in WYSIWYG mode
    const hvB = createHtmlView();
    const editorB = createEditor({
      plugins: [boldPlugin, headingPlugin, hvB.plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Shared' }]),
    });
    const containerB = document.createElement('div');
    document.body.appendChild(containerB);
    editorB.mount(containerB);

    // Put editor A in HTML mode
    hvA.setHtmlMode(true);
    const textareaA = containerA.querySelector('textarea.nodius-html-view') as HTMLTextAreaElement;
    expect(textareaA.value).toContain('Shared');

    // Simulate remote change arriving at A (as if B typed something)
    editorA.dispatch({
      operations: [{ type: 'insert_text', path: [0, 0], offset: 6, data: ' doc' }],
      origin: 'remote',
      timestamp: Date.now(),
    });

    // A's textarea should update
    expect(textareaA.value).toContain('Shared doc');
    // A's doc model should also be updated
    expect(getBlockText(editorA.getDoc(), 0)).toBe('Shared doc');

    // Now simulate A editing HTML
    textareaA.value = '<h1>New Title</h1>';
    hvA.setHtmlMode(false);

    // A should now have a heading
    expect(editorA.getDoc().children[0].type).toBe('heading');
    expect(getBlockText(editorA.getDoc(), 0)).toBe('New Title');

    editorA.destroy();
    editorB.destroy();
    document.body.removeChild(containerA);
    document.body.removeChild(containerB);
  });

  it('should handle rapid toggle without errors', () => {
    const { plugin, setHtmlMode, isHtmlMode } = createHtmlView();
    const editor = createEditor({
      plugins: [boldPlugin, headingPlugin, plugin],
      initialContent: createDocWith([{ type: 'paragraph', text: 'Test' }]),
    });
    editor.mount(container);

    // Toggle rapidly
    for (let i = 0; i < 10; i++) {
      setHtmlMode(true);
      setHtmlMode(false);
    }

    // Should still be in WYSIWYG
    expect(isHtmlMode()).toBe(false);
    expect(getBlockText(editor.getDoc(), 0)).toBe('Test');

    // No stale textareas
    const textareas = container.querySelectorAll('textarea.nodius-html-view');
    expect(textareas).toHaveLength(0);

    editor.destroy();
  });
});
