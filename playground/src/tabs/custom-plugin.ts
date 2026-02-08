import {
  createEditor,
  createHistoryPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  toolbarPlugin,
  type CoreEditor,
  type PluginDefinition,
} from '@nodius/editor';

let editor: CoreEditor | null = null;

const PLUGIN_SOURCE = `// ─── Custom Strikethrough Plugin ──────────────────────────────
//
// A plugin adds: markTypes, commands, keymaps, and toolbarItems.
// This is all you need to create a new formatting option.

const strikethroughPlugin = {
  name: 'strikethrough',

  // Register a new mark type
  markTypes: [{
    name: 'strikethrough',
    toDOM: () => ['s', 0],                // Render as <s> tag
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
  }],

  // Register commands
  commands: {
    'toggle-strikethrough': (editor) => {
      const state = editor.getState();
      const sel = state.selection;
      if (!sel) return false;

      const { anchor, focus } = sel;
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      if (from === to) return false;

      const mark = { type: 'strikethrough' };
      const blockPath = [anchor.blockIndex];
      const length = to - from;

      // Check if already has the mark
      const block = state.doc.children[anchor.blockIndex];
      const hasIt = block?.children.some(
        (c) => c.kind === 'text' && c.marks.some((m) => m.type === 'strikethrough')
      );

      editor.dispatch({
        operations: [{
          type: hasIt ? 'remove_mark' : 'add_mark',
          path: blockPath,
          offset: from,
          length,
          mark,
        }],
        origin: 'input',
        timestamp: Date.now(),
      });
      return true;
    },
  },

  // Keyboard shortcut
  keymaps: { 'Mod-Shift-s': 'toggle-strikethrough' },

  // Toolbar button
  toolbarItems: [{
    name: 'strikethrough',
    command: 'toggle-strikethrough',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16">'
        + '<line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2"/>'
        + '<text x="12" y="18" text-anchor="middle" font-size="14" fill="currentColor">S</text>'
        + '</svg>',
    label: 'Strikethrough',
    order: 35,
  }],
};`;

// Actual runtime plugin
const strikethroughPlugin: PluginDefinition = {
  name: 'strikethrough',
  markTypes: [{
    name: 'strikethrough',
    toDOM: () => ['s', 0],
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
  }],
  commands: {
    'toggle-strikethrough': (ed) => {
      const state = ed.getState();
      const sel = state.selection;
      if (!sel) return false;
      const { anchor, focus } = sel;
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      if (from === to) return false;
      const mark = { type: 'strikethrough' };
      const blockPath = [anchor.blockIndex];
      const length = to - from;
      const block = state.doc.children[anchor.blockIndex];
      const hasIt = block?.children.some(
        (c: any) => c.kind === 'text' && c.marks.some((m: any) => m.type === 'strikethrough'),
      );
      ed.dispatch({
        operations: [{
          type: hasIt ? 'remove_mark' : 'add_mark',
          path: blockPath,
          offset: from,
          length,
          mark,
        }],
        origin: 'input',
        timestamp: Date.now(),
      });
      return true;
    },
  },
  keymaps: { 'Mod-Shift-s': 'toggle-strikethrough' },
  toolbarItems: [{
    name: 'strikethrough',
    command: 'toggle-strikethrough',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2"/><text x="12" y="18" text-anchor="middle" font-size="14" fill="currentColor">S</text></svg>',
    label: 'Strikethrough',
    order: 35,
  }],
};

export function mount(container: HTMLElement): void {
  container.innerHTML = `
    <div class="panel">
      <h2>Custom Plugin — Strikethrough</h2>
      <p style="color:#64748b;font-size:0.8125rem;margin-bottom:1rem;">
        This example shows how to create a custom "strikethrough" plugin
        with its own mark type, keyboard shortcut (Ctrl+Shift+S), and toolbar button.
      </p>
      <div id="custom-editor-container"></div>
    </div>
    <div class="panel source-panel">
      <h2>Plugin Source Code</h2>
      <pre>${escapeHtml(PLUGIN_SOURCE)}</pre>
    </div>
  `;

  const { plugin: historyPlugin } = createHistoryPlugin();

  editor = createEditor({
    plugins: [
      boldPlugin,
      italicPlugin,
      underlinePlugin,
      strikethroughPlugin,
      toolbarPlugin,
      historyPlugin,
    ],
    toolbar: ['bold', 'italic', 'underline', 'strikethrough'],
  });

  editor.mount(document.getElementById('custom-editor-container')!);
}

export function destroy(): void {
  editor?.destroy();
  editor = null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
