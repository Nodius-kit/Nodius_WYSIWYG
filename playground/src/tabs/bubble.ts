import {
  createEditor,
  createHistoryPlugin,
  baseStylesPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  strikethroughPlugin,
  createHighlightPlugin,
  headingPlugin,
  listsPlugin,
  blockquotePlugin,
  codeBlockPlugin,
  horizontalRulePlugin,
  alignmentPlugin,
  createImageBase64Plugin,
  createImageToolbarPlugin,
  createImageDragPlugin,
  createLinkPlugin,
  createTextColorPlugin,
  createFloatingToolbarPlugin,
  type CoreEditor,
} from '@nodius/editor';

let editor: CoreEditor | null = null;
let unsub: (() => void) | null = null;

export function mount(container: HTMLElement): void {
  container.innerHTML = `
    <div class="panel">
      <h2>Bubble Editor</h2>
      <p class="shortcuts">
        <strong>No toolbar.</strong> Select text to see the floating toolbar.
        Use keyboard shortcuts for formatting.
      </p>
      <div id="bubble-editor-container"></div>
    </div>
    <div class="panel">
      <h2>Document State (JSON)</h2>
      <pre class="code-output" id="bubble-output"></pre>
    </div>
  `;

  const { plugin: historyPlugin } = createHistoryPlugin();
  const linkPlugin = createLinkPlugin();
  const highlightPlugin = createHighlightPlugin();
  const textColorPlugin = createTextColorPlugin();
  const floatingToolbarPlugin = createFloatingToolbarPlugin({
    items: [
      'bold', 'italic', 'underline', 'strikethrough',
      '|',
      'highlight', 'text-color',
      '|',
      'link',
      '|',
      'heading-1', 'heading-2', 'heading-3',
    ],
  });

  editor = createEditor({
    plugins: [
      baseStylesPlugin,
      boldPlugin,
      italicPlugin,
      underlinePlugin,
      strikethroughPlugin,
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
      createImageToolbarPlugin(),
      createImageDragPlugin(),
      floatingToolbarPlugin,
      historyPlugin,
    ],
  });

  editor.mount(document.getElementById('bubble-editor-container')!);

  const output = document.getElementById('bubble-output')!;
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
