import {
  createEditor,
  createHistoryPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  headingPlugin,
  listsPlugin,
  toolbarPlugin,
  createImageBase64Plugin,
  createImageResizePlugin,
  createImageCropPlugin,
  createHtmlViewPlugin,
  paragraphNodeType,
  type CoreEditor,
  type NodeTypeSpec,
  type MarkTypeSpec,
} from '@nodius/editor';

let editor: CoreEditor | null = null;
let unsub: (() => void) | null = null;

export function mount(container: HTMLElement): void {
  container.innerHTML = `
    <div class="panel">
      <h2>Basic Editor</h2>
      <div id="basic-editor-container"></div>
      <p class="shortcuts">
        <strong>Shortcuts:</strong>
        Ctrl+B (Bold) &middot; Ctrl+I (Italic) &middot; Ctrl+U (Underline) &middot;
        Ctrl+Z (Undo) &middot; Ctrl+Shift+Z (Redo) &middot;
        Ctrl+Alt+1/2/3 (Headings)
      </p>
    </div>
    <div class="panel">
      <h2>Document State (JSON)</h2>
      <pre class="code-output" id="basic-output"></pre>
    </div>
  `;

  const { plugin: historyPlugin } = createHistoryPlugin();

  // Collect specs for HTML view plugin
  const nodeTypes: NodeTypeSpec[] = [
    paragraphNodeType,
    ...headingPlugin.nodeTypes!,
    ...listsPlugin.nodeTypes!,
  ];
  const markTypes: MarkTypeSpec[] = [
    ...boldPlugin.markTypes!,
    ...italicPlugin.markTypes!,
    ...underlinePlugin.markTypes!,
  ];
  const { plugin: htmlViewPlugin } = createHtmlViewPlugin({ nodeTypes, markTypes });

  editor = createEditor({
    plugins: [
      boldPlugin,
      italicPlugin,
      underlinePlugin,
      headingPlugin,
      listsPlugin,
      createImageBase64Plugin(),
      createImageResizePlugin(),
      createImageCropPlugin(),
      htmlViewPlugin,
      toolbarPlugin,
      historyPlugin,
    ],
    toolbar: [
      'bold', 'italic', 'underline',
      '|',
      'heading-1', 'heading-2', 'heading-3',
      '|',
      'ordered-list', 'unordered-list',
      '|',
      'image',
      '|',
      'html-view',
    ],
  });

  editor.mount(document.getElementById('basic-editor-container')!);

  const output = document.getElementById('basic-output')!;
  output.textContent = JSON.stringify(editor.getState().doc, null, 2);

  unsub = editor.on('state:change', ({ nextState }) => {
    output.textContent = JSON.stringify(nextState.doc, null, 2);
  });
}

export function destroy(): void {
  unsub?.();
  unsub = null;
  editor?.destroy();
  editor = null;
}
