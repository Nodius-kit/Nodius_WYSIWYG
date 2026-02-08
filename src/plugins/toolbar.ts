import type { PluginDefinition, PluginContext, PluginInstance, ToolbarItemSpec, ContentState } from '../core/types';

const DEFAULT_CSS = `
.nodius-editor {
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.nodius-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid #ddd;
  background: #fafafa;
}
.nodius-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: #444;
  padding: 0;
}
.nodius-toolbar-btn:hover {
  background: #e8e8e8;
}
.nodius-toolbar-btn.active {
  background: #d0d0ff;
  color: #1a1aff;
}
.nodius-toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.nodius-toolbar-sep {
  width: 1px;
  height: 20px;
  background: #ccc;
  margin: 0 4px;
}
.nodius-editable {
  padding: 12px 16px;
  min-height: 100px;
  outline: none;
  line-height: 1.6;
}
.nodius-editable:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
  pointer-events: none;
}
.nodius-editable p { margin: 0 0 0.5em 0; }
.nodius-editable h1 { font-size: 2em; margin: 0 0 0.5em 0; }
.nodius-editable h2 { font-size: 1.5em; margin: 0 0 0.5em 0; }
.nodius-editable h3 { font-size: 1.17em; margin: 0 0 0.5em 0; }
.nodius-editable ol, .nodius-editable ul { margin: 0 0 0.5em 1.5em; padding: 0; }
.nodius-editable li { margin: 0 0 0.25em 0; }
.nodius-editable img { max-width: 100%; height: auto; display: block; margin: 8px 0; }
`;

function injectStyles(): void {
  if (document.querySelector('style[data-nodius]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-nodius', '');
  style.textContent = DEFAULT_CSS;
  document.head.appendChild(style);
}

export const toolbarPlugin: PluginDefinition = {
  name: 'toolbar',

  init(ctx: PluginContext): PluginInstance {
    injectStyles();

    let toolbarEl: HTMLElement | null = null;
    let unsubState: (() => void) | null = null;
    const buttons: Map<string, HTMLButtonElement> = new Map();
    let items: ToolbarItemSpec[] = [];

    function buildToolbar() {
      const rootEl = ctx.editor.getRootElement();
      if (!rootEl || toolbarEl) return;

      toolbarEl = document.createElement('div');
      toolbarEl.className = 'nodius-toolbar';
      rootEl.insertBefore(toolbarEl, rootEl.firstChild);

      const allItems = (ctx.editor as any).getPlugins().getAllToolbarItems() as ToolbarItemSpec[];
      const toolbarConfig: string[] | undefined = (ctx.editor as any).getToolbarConfig?.();

      if (toolbarConfig) {
        const itemMap = new Map<string, ToolbarItemSpec>();
        for (const item of allItems) {
          itemMap.set(item.name, item);
        }

        for (const entry of toolbarConfig) {
          if (entry === '|') {
            const sep = document.createElement('div');
            sep.className = 'nodius-toolbar-sep';
            toolbarEl.appendChild(sep);
            continue;
          }

          const item = itemMap.get(entry);
          if (!item) {
            console.warn(`[nodius] Toolbar config: unknown item "${entry}", skipping.`);
            continue;
          }
          items.push(item);
          appendButton(toolbarEl!, item);
        }
      } else {
        items = allItems;
        for (const item of items) {
          if (item.name === '|') {
            const sep = document.createElement('div');
            sep.className = 'nodius-toolbar-sep';
            toolbarEl.appendChild(sep);
            continue;
          }
          appendButton(toolbarEl!, item);
        }
      }

      unsubState = ctx.editor.on('state:change', ({ nextState }) => {
        for (const item of items) {
          const btn = buttons.get(item.name);
          if (!btn) continue;
          if (item.isActive) {
            btn.classList.toggle('active', item.isActive(nextState));
          }
          if (item.isDisabled) {
            btn.disabled = item.isDisabled(nextState);
          }
        }
      });
    }

    function appendButton(parent: HTMLElement, item: ToolbarItemSpec) {
      const btn = document.createElement('button');
      btn.className = 'nodius-toolbar-btn';
      btn.title = item.title;
      btn.innerHTML = item.icon;
      btn.type = 'button';
      btn.setAttribute('data-command', item.command);

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (item.commandArgs) {
          ctx.editor.executeCommand(item.command, item.commandArgs);
        } else {
          ctx.editor.executeCommand(item.command);
        }
      });

      parent.appendChild(btn);
      buttons.set(item.name, btn);
    }

    // Build toolbar on mount (deferred since plugins init before mount)
    const unsubMount = ctx.editor.on('mount', () => {
      buildToolbar();
    });

    // Also try immediately in case already mounted
    buildToolbar();

    return {
      destroy() {
        unsubMount();
        if (unsubState) unsubState();
        if (toolbarEl) toolbarEl.remove();
        toolbarEl = null;
      },
    };
  },
};
