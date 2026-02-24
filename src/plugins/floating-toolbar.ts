import type { PluginDefinition, PluginContext, PluginInstance, ToolbarItemSpec, ContentState } from '../core/types';

let floatingStyleInjected = false;

function injectFloatingStyles(): void {
  if (floatingStyleInjected) return;
  floatingStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.nodius-floating-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  z-index: 150;
  animation: nodius-float-in 0.12s ease-out;
  pointer-events: auto;
}
@keyframes nodius-float-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.nodius-floating-toolbar .nodius-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: #475569;
  padding: 0;
  transition: background 0.1s, color 0.1s;
}
.nodius-floating-toolbar .nodius-toolbar-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}
.nodius-floating-toolbar .nodius-toolbar-btn.active {
  background: #e0e7ff;
  color: #3b82f6;
}
.nodius-floating-toolbar .nodius-toolbar-sep {
  width: 1px;
  height: 20px;
  background: #e2e8f0;
  margin: 0 2px;
}
`;
  document.head.appendChild(style);
}

export interface FloatingToolbarConfig {
  items?: string[];
  offset?: number;
}

export function createFloatingToolbarPlugin(config?: FloatingToolbarConfig): PluginDefinition {
  const offset = config?.offset ?? 8;
  const itemFilter = config?.items;

  return {
    name: 'floating-toolbar',
    dependencies: ['base-styles'],

    init(ctx: PluginContext): PluginInstance {
      injectFloatingStyles();

      let toolbarEl: HTMLElement | null = null;
      let buttons: Map<string, HTMLButtonElement> = new Map();
      let items: ToolbarItemSpec[] = [];
      let activeDropdown: { el: HTMLElement; destroy: () => void } | null = null;

      function closeDropdown() {
        if (activeDropdown) {
          activeDropdown.destroy();
          activeDropdown = null;
        }
      }

      function getItems(): ToolbarItemSpec[] {
        const allItems = (ctx.editor as any).getPlugins().getAllToolbarItems() as ToolbarItemSpec[];
        if (itemFilter) {
          const itemMap = new Map<string, ToolbarItemSpec>();
          for (const item of allItems) itemMap.set(item.name, item);
          return itemFilter.map((name) => itemMap.get(name)).filter(Boolean) as ToolbarItemSpec[];
        }
        // Default: show inline formatting items only (marks)
        return allItems;
      }

      function updateButtons(state: ContentState) {
        for (const item of items) {
          const btn = buttons.get(item.name);
          if (!btn) continue;
          if (item.isActive) {
            btn.classList.toggle('active', item.isActive(state));
          }
        }
      }

      function showToolbar(): void {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          hideToolbar();
          return;
        }

        const editable = ctx.editor.getEditableElement();
        if (!editable) return;

        // Verify the selection is within the editable area
        if (!editable.contains(sel.anchorNode)) {
          hideToolbar();
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          hideToolbar();
          return;
        }

        if (!toolbarEl) {
          buildToolbar();
        }

        if (!toolbarEl) return;

        const editableRect = editable.getBoundingClientRect();

        // Position above the selection, centered
        let left = rect.left + rect.width / 2 - editableRect.left;
        let top = rect.top - editableRect.top - offset;

        // The toolbar needs to be in the DOM to measure its size
        editable.style.position = 'relative';
        toolbarEl.style.visibility = 'hidden';
        toolbarEl.style.display = 'flex';
        if (!toolbarEl.parentElement) editable.appendChild(toolbarEl);

        const tbRect = toolbarEl.getBoundingClientRect();
        left -= tbRect.width / 2;
        top -= tbRect.height;

        // Clamp to stay within editable bounds
        left = Math.max(0, Math.min(left, editableRect.width - tbRect.width));

        toolbarEl.style.left = `${left}px`;
        toolbarEl.style.top = `${top}px`;
        toolbarEl.style.visibility = 'visible';

        updateButtons(ctx.editor.getState());
      }

      function hideToolbar(): void {
        closeDropdown();
        if (toolbarEl) {
          toolbarEl.style.display = 'none';
        }
      }

      function buildToolbar(): void {
        items = getItems();
        toolbarEl = document.createElement('div');
        toolbarEl.className = 'nodius-floating-toolbar';
        toolbarEl.style.display = 'none';
        buttons = new Map();

        for (const item of items) {
          if (item.name === '|') {
            const sep = document.createElement('div');
            sep.className = 'nodius-toolbar-sep';
            toolbarEl.appendChild(sep);
            continue;
          }

          const btn = document.createElement('button');
          btn.className = 'nodius-toolbar-btn';
          btn.title = item.title;
          btn.innerHTML = item.icon;
          btn.type = 'button';
          btn.setAttribute('data-command', item.command);

          if (item.dropdown) {
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              if (activeDropdown) {
                closeDropdown();
                return;
              }
              const state = ctx.editor.getState();
              activeDropdown = item.dropdown!(state, btn, (name, args) => ctx.editor.executeCommand(name, args));
              toolbarEl!.appendChild(activeDropdown.el);

              const onClickOutside = (ev: MouseEvent) => {
                if (activeDropdown && !activeDropdown.el.contains(ev.target as Node) && ev.target !== btn) {
                  closeDropdown();
                  document.removeEventListener('mousedown', onClickOutside, true);
                }
              };
              setTimeout(() => document.addEventListener('mousedown', onClickOutside, true), 0);
            });
          } else {
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              if (item.commandArgs) {
                ctx.editor.executeCommand(item.command, item.commandArgs);
              } else {
                ctx.editor.executeCommand(item.command);
              }
            });
          }

          toolbarEl.appendChild(btn);
          buttons.set(item.name, btn);
        }
      }

      const unsubState = ctx.editor.on('state:change', () => {
        // Small delay to let browser update selection
        requestAnimationFrame(() => showToolbar());
      });

      const unsubSelection = ctx.editor.on('selection:change', () => {
        requestAnimationFrame(() => showToolbar());
      });

      // Hide on mousedown outside (prevent toolbar from persisting on click away)
      function onDocMouseDown(e: MouseEvent) {
        if (toolbarEl && !toolbarEl.contains(e.target as Node)) {
          // Let the selection event handle show/hide
        }
      }
      document.addEventListener('mousedown', onDocMouseDown);

      return {
        destroy() {
          unsubState();
          unsubSelection();
          document.removeEventListener('mousedown', onDocMouseDown);
          closeDropdown();
          if (toolbarEl) {
            toolbarEl.remove();
            toolbarEl = null;
          }
        },
      };
    },
  };
}
