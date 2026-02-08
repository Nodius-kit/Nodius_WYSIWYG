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
  type CoreEditor,
  type PluginDefinition,
} from '@nodius/editor';
import { generateCode } from '../utils/code-generator';

// ─── Plugin Registry ──────────────────────────────────────────

interface PluginRegistryEntry {
  id: string;
  label: string;
  importName: string;
  isFactory: boolean;
  factoryCall?: string;
  destructure?: string;
  toolbarItems: string[];
  alwaysOn?: boolean;
  createPlugin: () => PluginDefinition;
}

const PLUGIN_REGISTRY: PluginRegistryEntry[] = [
  {
    id: 'bold', label: 'Bold', importName: 'boldPlugin',
    isFactory: false, toolbarItems: ['bold'],
    createPlugin: () => boldPlugin,
  },
  {
    id: 'italic', label: 'Italic', importName: 'italicPlugin',
    isFactory: false, toolbarItems: ['italic'],
    createPlugin: () => italicPlugin,
  },
  {
    id: 'underline', label: 'Underline', importName: 'underlinePlugin',
    isFactory: false, toolbarItems: ['underline'],
    createPlugin: () => underlinePlugin,
  },
  {
    id: 'heading', label: 'Headings', importName: 'headingPlugin',
    isFactory: false, toolbarItems: ['heading-1', 'heading-2', 'heading-3'],
    createPlugin: () => headingPlugin,
  },
  {
    id: 'lists', label: 'Lists', importName: 'listsPlugin',
    isFactory: false, toolbarItems: ['ordered-list', 'unordered-list'],
    createPlugin: () => listsPlugin,
  },
  {
    id: 'image', label: 'Image (Base64)', importName: 'createImageBase64Plugin',
    isFactory: true, factoryCall: 'createImageBase64Plugin()', toolbarItems: ['image'],
    createPlugin: () => createImageBase64Plugin(),
  },
  {
    id: 'history', label: 'History (Undo/Redo)', importName: 'createHistoryPlugin',
    isFactory: true, factoryCall: 'createHistoryPlugin()',
    destructure: '{ plugin: historyPlugin }', toolbarItems: [],
    createPlugin: () => createHistoryPlugin().plugin,
  },
  {
    id: 'toolbar', label: 'Toolbar', importName: 'toolbarPlugin',
    isFactory: false, toolbarItems: [], alwaysOn: true,
    createPlugin: () => toolbarPlugin,
  },
];

// ─── Builder State ────────────────────────────────────────────

let enabledPlugins: Set<string>;
let toolbarItems: string[];
let editor: CoreEditor | null = null;

function getDefaults() {
  return {
    enabled: new Set(PLUGIN_REGISTRY.map((p) => p.id)),
    toolbar: [
      'bold', 'italic', 'underline',
      '|',
      'heading-1', 'heading-2', 'heading-3',
      '|',
      'ordered-list', 'unordered-list',
      '|',
      'image',
    ],
  };
}

// ─── Rendering ────────────────────────────────────────────────

let container: HTMLElement | null = null;

export function mount(root: HTMLElement): void {
  container = root;
  const defaults = getDefaults();
  enabledPlugins = defaults.enabled;
  toolbarItems = [...defaults.toolbar];
  render();
}

export function destroy(): void {
  editor?.destroy();
  editor = null;
  container = null;
}

function render(): void {
  if (!container) return;

  // Destroy previous editor before re-rendering
  editor?.destroy();
  editor = null;

  container.innerHTML = `
    <div class="builder-layout">
      <div class="panel builder-plugins">
        <h2>Plugins</h2>
        <div id="builder-plugin-list"></div>
      </div>
      <div class="panel">
        <h2>Toolbar Layout</h2>
        <ul class="toolbar-list" id="builder-toolbar-list"></ul>
        <div class="builder-actions" id="builder-actions"></div>
      </div>
      <div class="panel builder-preview">
        <h2>Live Preview</h2>
        <div class="preview-editor" id="builder-editor-container"></div>
        <div>
          <div class="builder-code-header">
            <h2>Generated Code</h2>
            <button class="copy-btn" id="builder-copy-btn">Copy</button>
          </div>
          <pre class="code-output" id="builder-code-output"></pre>
        </div>
      </div>
    </div>
  `;

  renderPluginList();
  renderToolbarList();
  renderActions();
  rebuildEditor();
  renderCode();

  // Copy button
  document.getElementById('builder-copy-btn')!.addEventListener('click', handleCopy);
}

function renderPluginList(): void {
  const el = document.getElementById('builder-plugin-list')!;
  el.innerHTML = '';

  for (const entry of PLUGIN_REGISTRY) {
    const label = document.createElement('label');
    if (entry.alwaysOn) label.className = 'disabled';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabledPlugins.has(entry.id);
    checkbox.disabled = !!entry.alwaysOn;
    checkbox.dataset.pluginId = entry.id;
    checkbox.addEventListener('change', () => handlePluginToggle(entry.id, checkbox.checked));

    const span = document.createElement('span');
    span.textContent = entry.label;
    if (entry.toolbarItems.length > 0) {
      span.textContent += ` (${entry.toolbarItems.join(', ')})`;
    }

    label.appendChild(checkbox);
    label.appendChild(span);
    el.appendChild(label);
  }
}

let dragSrcIndex: number | null = null;

function renderToolbarList(): void {
  const el = document.getElementById('builder-toolbar-list')!;
  el.innerHTML = '';

  toolbarItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'toolbar-item' + (item === '|' ? ' separator' : '');
    li.draggable = true;
    li.dataset.index = String(index);

    // Drag handle indicator
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.textContent = '\u2630';
    grip.title = 'Drag to reorder';
    li.appendChild(grip);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item === '|' ? '── separator ──' : item;
    li.appendChild(nameSpan);

    // Move up (accessibility fallback)
    const upBtn = document.createElement('button');
    upBtn.className = 'move-btn';
    upBtn.textContent = '\u25B2';
    upBtn.title = 'Move up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveItem(index, -1));
    li.appendChild(upBtn);

    // Move down (accessibility fallback)
    const downBtn = document.createElement('button');
    downBtn.className = 'move-btn';
    downBtn.textContent = '\u25BC';
    downBtn.title = 'Move down';
    downBtn.disabled = index === toolbarItems.length - 1;
    downBtn.addEventListener('click', () => moveItem(index, 1));
    li.appendChild(downBtn);

    // Remove
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '\u2715';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => removeItem(index));
    li.appendChild(removeBtn);

    // Drag events
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      li.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', String(index));
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      dragSrcIndex = null;
      clearDragIndicators(el);
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      if (dragSrcIndex === null || dragSrcIndex === index) return;

      clearDragIndicators(el);
      const rect = li.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        li.classList.add('drag-over-above');
      } else {
        li.classList.add('drag-over-below');
      }
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over-above', 'drag-over-below');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === index) return;

      const rect = li.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let targetIndex = e.clientY < midY ? index : index + 1;

      // Adjust if dragging from before the target
      const item = toolbarItems.splice(dragSrcIndex, 1)[0];
      if (dragSrcIndex < targetIndex) targetIndex--;
      toolbarItems.splice(targetIndex, 0, item);

      dragSrcIndex = null;
      clearDragIndicators(el);
      onConfigChange();
    });

    el.appendChild(li);
  });
}

function clearDragIndicators(container: HTMLElement): void {
  for (const child of Array.from(container.children)) {
    child.classList.remove('drag-over-above', 'drag-over-below');
  }
}

function renderActions(): void {
  const el = document.getElementById('builder-actions')!;
  el.innerHTML = '';

  // Add separator button
  const sepBtn = document.createElement('button');
  sepBtn.textContent = 'Add separator |';
  sepBtn.addEventListener('click', () => {
    toolbarItems.push('|');
    onConfigChange();
  });
  el.appendChild(sepBtn);

  // Add item dropdown
  const available = getAvailableItems();
  if (available.length > 0) {
    const select = document.createElement('select');
    const defaultOpt = document.createElement('option');
    defaultOpt.textContent = '+ Add item...';
    defaultOpt.value = '';
    select.appendChild(defaultOpt);

    for (const item of available) {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      if (select.value) {
        toolbarItems.push(select.value);
        onConfigChange();
      }
    });
    el.appendChild(select);
  }
}

function getAvailableItems(): string[] {
  const used = new Set(toolbarItems.filter((t) => t !== '|'));
  const items: string[] = [];
  for (const entry of PLUGIN_REGISTRY) {
    if (!enabledPlugins.has(entry.id)) continue;
    for (const item of entry.toolbarItems) {
      if (!used.has(item)) items.push(item);
    }
  }
  return items;
}

// ─── Event Handlers ───────────────────────────────────────────

function handlePluginToggle(pluginId: string, checked: boolean): void {
  if (checked) {
    enabledPlugins.add(pluginId);
  } else {
    enabledPlugins.delete(pluginId);
    // Remove toolbar items belonging to this plugin
    const entry = PLUGIN_REGISTRY.find((p) => p.id === pluginId)!;
    const toRemove = new Set(entry.toolbarItems);
    toolbarItems = toolbarItems.filter((t) => !toRemove.has(t));
  }
  onConfigChange();
}

function moveItem(index: number, direction: -1 | 1): void {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= toolbarItems.length) return;
  const temp = toolbarItems[index];
  toolbarItems[index] = toolbarItems[newIndex];
  toolbarItems[newIndex] = temp;
  onConfigChange();
}

function removeItem(index: number): void {
  toolbarItems.splice(index, 1);
  onConfigChange();
}

function onConfigChange(): void {
  renderToolbarList();
  renderActions();
  rebuildEditor();
  renderCode();
}

// ─── Editor Rebuild ───────────────────────────────────────────

function rebuildEditor(): void {
  editor?.destroy();
  editor = null;

  const editorContainer = document.getElementById('builder-editor-container');
  if (!editorContainer) return;
  editorContainer.innerHTML = '';

  const plugins: PluginDefinition[] = [];
  for (const entry of PLUGIN_REGISTRY) {
    if (!enabledPlugins.has(entry.id)) continue;
    plugins.push(entry.createPlugin());
  }

  editor = createEditor({
    plugins,
    toolbar: [...toolbarItems],
  });

  editor.mount(editorContainer);
}

// ─── Code Generation ─────────────────────────────────────────

function renderCode(): void {
  const codeEl = document.getElementById('builder-code-output');
  if (!codeEl) return;

  const pluginEntries = PLUGIN_REGISTRY
    .filter((p) => enabledPlugins.has(p.id))
    .map((p) => ({
      id: p.id,
      importName: p.importName,
      isFactory: p.isFactory,
      factoryCall: p.factoryCall,
      destructure: p.destructure,
    }));

  codeEl.textContent = generateCode(pluginEntries, toolbarItems);
}

function handleCopy(): void {
  const codeEl = document.getElementById('builder-code-output');
  const btn = document.getElementById('builder-copy-btn');
  if (!codeEl || !btn) return;

  navigator.clipboard.writeText(codeEl.textContent ?? '').then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1500);
  });
}
