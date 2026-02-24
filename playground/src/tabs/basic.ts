import {
  createEditor,
  createHistoryPlugin,
  baseStylesPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  strikethroughPlugin,
  subscriptPlugin,
  superscriptPlugin,
  createHighlightPlugin,
  headingPlugin,
  listsPlugin,
  blockquotePlugin,
  codeBlockPlugin,
  horizontalRulePlugin,
  alignmentPlugin,
  toolbarPlugin,
  createImageBase64Plugin,
  createImageRemotePlugin,
  createImageResizePlugin,
  createImageCropPlugin,
  createImageToolbarPlugin,
  createImageDragPlugin,
  createHtmlViewPlugin,
  createLinkPlugin,
  createTextColorPlugin,
  createPdfExportPlugin,
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
        Ctrl+Shift+X (Strikethrough) &middot; Ctrl+, (Subscript) &middot; Ctrl+. (Superscript) &middot;
        Ctrl+Shift+H (Highlight) &middot; Ctrl+K (Link) &middot;
        Ctrl+Alt+1/2/3 (Headings) &middot; Ctrl+Shift+B (Blockquote) &middot; Ctrl+Shift+C (Code Block) &middot;
        Ctrl+Shift+L/E/R/J (Align) &middot; Ctrl+Z (Undo) &middot; Ctrl+Shift+Z (Redo)
      </p>
      <p class="shortcuts">
        <strong>New:</strong>
        Text Color (dropdown) &middot; Highlight Color (dropdown) &middot;
        Image Drag &amp; Drop &middot; Export PDF
      </p>
    </div>
    <div class="panel">
      <h2>Document State (JSON)</h2>
      <pre class="code-output" id="basic-output"></pre>
    </div>
  `;

  const { plugin: historyPlugin } = createHistoryPlugin();
  const linkPlugin = createLinkPlugin();
  const highlightPlugin = createHighlightPlugin();
  const textColorPlugin = createTextColorPlugin();
  const pdfExportPlugin = createPdfExportPlugin();

  // Fake upload function for image-remote demo (converts to data URL)
  const imageRemotePlugin = createImageRemotePlugin({
    uploadFn: (file: File) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    }),
  });

  // Collect specs for HTML view plugin
  const nodeTypes: NodeTypeSpec[] = [
    paragraphNodeType,
    ...headingPlugin.nodeTypes!,
    ...listsPlugin.nodeTypes!,
    ...blockquotePlugin.nodeTypes!,
    ...codeBlockPlugin.nodeTypes!,
    ...horizontalRulePlugin.nodeTypes!,
  ];
  const markTypes: MarkTypeSpec[] = [
    ...boldPlugin.markTypes!,
    ...italicPlugin.markTypes!,
    ...underlinePlugin.markTypes!,
    ...strikethroughPlugin.markTypes!,
    ...subscriptPlugin.markTypes!,
    ...superscriptPlugin.markTypes!,
    ...highlightPlugin.markTypes!,
    ...textColorPlugin.markTypes!,
    ...linkPlugin.markTypes!,
  ];
  const { plugin: htmlViewPlugin } = createHtmlViewPlugin({ nodeTypes, markTypes });

  editor = createEditor({
    plugins: [
      baseStylesPlugin,
      boldPlugin,
      italicPlugin,
      underlinePlugin,
      strikethroughPlugin,
      subscriptPlugin,
      superscriptPlugin,
      highlightPlugin,
      textColorPlugin,
      headingPlugin,
      listsPlugin,
      blockquotePlugin,
      codeBlockPlugin,
      horizontalRulePlugin,
      alignmentPlugin,
      linkPlugin,
      createImageBase64Plugin(),
      imageRemotePlugin,
      createImageResizePlugin(),
      createImageCropPlugin(),
      createImageToolbarPlugin(),
      createImageDragPlugin(),
      htmlViewPlugin,
      pdfExportPlugin,
      toolbarPlugin,
      historyPlugin,
    ],
    toolbar: [
      'bold', 'italic', 'underline', 'strikethrough',
      '|',
      'subscript', 'superscript', 'highlight', 'text-color',
      '|',
      'link',
      '|',
      'heading-1', 'heading-2', 'heading-3',
      '|',
      'blockquote', 'code-block', 'horizontal-rule',
      '|',
      'ordered-list', 'unordered-list',
      '|',
      'align-left', 'align-center', 'align-right', 'align-justify',
      '|',
      'image', 'image-upload',
      '|',
      'pdf-export', 'html-view',
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
