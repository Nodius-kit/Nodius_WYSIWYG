import type {
  PluginDefinition,
  PluginContext,
  EditorInterface,
  ContentState,
  NodeTypeSpec,
  MarkTypeSpec,
} from '../core/types';
import { toHTML } from '../core/export';
import { fromHTML } from '../core/import';
import { ICONS } from '../assets/icons';

const HTML_VIEW_CSS = `
.nodius-html-view {
  width: 100%;
  min-height: 200px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #1e1e1e;
  color: #d4d4d4;
  resize: vertical;
  tab-size: 2;
  white-space: pre-wrap;
  word-wrap: break-word;
  box-sizing: border-box;
}
.nodius-html-view:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
}
`;

function injectCSS(): void {
  if (document.getElementById('nodius-html-view-css')) return;
  const style = document.createElement('style');
  style.id = 'nodius-html-view-css';
  style.textContent = HTML_VIEW_CSS;
  document.head.appendChild(style);
}

export interface HtmlViewPluginOptions {
  nodeTypes: readonly NodeTypeSpec[];
  markTypes: readonly MarkTypeSpec[];
}

export function createHtmlViewPlugin(options: HtmlViewPluginOptions): {
  plugin: PluginDefinition;
  isHtmlMode: () => boolean;
  setHtmlMode: (enabled: boolean) => void;
} {
  let editor: EditorInterface | null = null;
  let editableEl: HTMLElement | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;
  let htmlMode = false;
  let applyingFromHtml = false;
  let applyingRemoteInHtml = false;
  let unsubStateChange: (() => void) | null = null;

  const specs = { nodeTypes: options.nodeTypes, markTypes: options.markTypes };

  function getHtml(): string {
    if (!editor) return '';
    return toHTML(editor.getDoc(), specs);
  }

  function applyHtmlToDoc(html: string): void {
    if (!editor) return;
    try {
      const newDoc = fromHTML(html, specs);
      applyingFromHtml = true;
      editor.dispatch({
        operations: [],
        doc: newDoc,
        origin: 'html-view',
        timestamp: Date.now(),
      });
      applyingFromHtml = false;
    } catch {
      // Invalid HTML — ignore silently
      applyingFromHtml = false;
    }
  }

  function enterHtmlMode(): void {
    if (!editor) return;
    // Resolve editable lazily (init runs before mount)
    if (!editableEl) editableEl = editor.getEditableElement();
    if (!editableEl) return;
    htmlMode = true;
    injectCSS();

    // Hide the WYSIWYG editable
    editableEl.style.display = 'none';

    // Create textarea
    textareaEl = document.createElement('textarea');
    textareaEl.className = 'nodius-html-view';
    textareaEl.value = getHtml();
    textareaEl.spellcheck = false;

    // Insert textarea after editable
    editableEl.parentElement!.insertBefore(textareaEl, editableEl.nextSibling);

    // Listen for textarea changes with debounce
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    textareaEl.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (textareaEl && htmlMode) {
          applyHtmlToDoc(textareaEl.value);
        }
      }, 300);
    });

    // Listen for remote state changes and update textarea
    unsubStateChange = editor.on('state:change', () => {
      if (applyingFromHtml) return; // Don't update textarea from our own changes
      if (!textareaEl || !htmlMode) return;
      applyingRemoteInHtml = true;
      // Preserve cursor position
      const start = textareaEl.selectionStart;
      const end = textareaEl.selectionEnd;
      textareaEl.value = getHtml();
      // Restore cursor as close as possible
      textareaEl.selectionStart = Math.min(start, textareaEl.value.length);
      textareaEl.selectionEnd = Math.min(end, textareaEl.value.length);
      applyingRemoteInHtml = false;
    });
  }

  function exitHtmlMode(): void {
    if (!editor) return;
    if (!editableEl) editableEl = editor.getEditableElement();
    if (!editableEl) return;

    // Apply final HTML content before switching back
    if (textareaEl) {
      applyHtmlToDoc(textareaEl.value);
      textareaEl.remove();
      textareaEl = null;
    }

    // Unsubscribe state change listener
    unsubStateChange?.();
    unsubStateChange = null;

    // Show WYSIWYG editable
    editableEl.style.display = '';
    htmlMode = false;
  }

  function toggleHtmlMode(): void {
    if (htmlMode) {
      exitHtmlMode();
    } else {
      enterHtmlMode();
    }
  }

  const plugin: PluginDefinition = {
    name: 'html-view',

    init(ctx: PluginContext) {
      editor = ctx.editor;
      editableEl = ctx.editor.getEditableElement();

      ctx.commands.register('toggle-html-view', () => {
        toggleHtmlMode();
        return true;
      });

      return {
        destroy() {
          if (htmlMode) exitHtmlMode();
          editor = null;
          editableEl = null;
        },
      };
    },

    toolbarItems: [{
      name: 'html-view',
      icon: ICONS.code,
      title: 'Toggle HTML Source',
      command: 'toggle-html-view',
      isActive: () => htmlMode,
      order: 90,
    }],
  };

  return {
    plugin,
    isHtmlMode: () => htmlMode,
    setHtmlMode: (enabled: boolean) => {
      if (enabled && !htmlMode) enterHtmlMode();
      else if (!enabled && htmlMode) exitHtmlMode();
    },
  };
}
