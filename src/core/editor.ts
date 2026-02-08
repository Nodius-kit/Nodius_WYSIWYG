import type {
  EditorConfig,
  EditorInterface,
  EditorEvents,
  ContentState,
  Document,
  EditorSelection,
  Transaction,
  Operation,
  PluginContext,
} from './types';
import { StateManager } from './state';
import { EventBus } from './events';
import { CommandRegistry } from './commands';
import { KeymapRegistry } from './keymap';
import { PluginRegistry } from './plugin';
import { Schema, paragraphNodeType } from './schema';
import { Reconciler } from './reconciler';
import { SelectionManager } from './selection';

export class CoreEditor implements EditorInterface {
  private stateManager: StateManager;
  private eventBus: EventBus;
  private commandRegistry: CommandRegistry;
  private keymapRegistry: KeymapRegistry;
  private pluginRegistry: PluginRegistry;
  private schema: Schema;
  private reconciler: Reconciler;
  private selectionManager: SelectionManager;

  private rootElement: HTMLElement | null = null;
  private editableElement: HTMLElement | null = null;
  private mounted = false;
  private readOnly: boolean;
  private placeholder: string;
  private toolbarConfig: string[] | undefined;
  private composing = false;

  // Bound event handlers (for cleanup)
  private boundHandleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundHandleBeforeInput: ((e: InputEvent) => void) | null = null;
  private boundHandleCompositionStart: (() => void) | null = null;
  private boundHandleCompositionEnd: ((e: CompositionEvent) => void) | null = null;
  private boundHandleFocus: (() => void) | null = null;
  private boundHandleBlur: (() => void) | null = null;
  private boundHandlePaste: ((e: ClipboardEvent) => void) | null = null;
  private boundHandleSelectionChange: (() => void) | null = null;

  constructor(config: EditorConfig = {}) {
    this.readOnly = config.readOnly ?? false;
    this.placeholder = config.placeholder ?? '';
    this.toolbarConfig = config.toolbar;

    // Initialize core systems
    this.eventBus = new EventBus();
    this.commandRegistry = new CommandRegistry();
    this.keymapRegistry = new KeymapRegistry();
    this.pluginRegistry = new PluginRegistry();
    this.reconciler = new Reconciler();
    this.selectionManager = new SelectionManager();

    // Wire dependencies
    this.commandRegistry.setEditor(this);
    this.keymapRegistry.setCommands(this.commandRegistry);

    // Initial state
    const initialState: ContentState = config.initialContent
      ? { doc: config.initialContent, selection: null }
      : StateManager.createEmptyState();
    this.stateManager = new StateManager(initialState);

    // Register plugins
    if (config.plugins) {
      this.pluginRegistry.registerAll(config.plugins);
    }

    // Build schema from plugins
    const nodeTypes = [paragraphNodeType, ...this.pluginRegistry.getAllNodeTypes()];
    const markTypes = this.pluginRegistry.getAllMarkTypes();
    this.schema = new Schema(nodeTypes, markTypes);
    this.reconciler.setSpecs(nodeTypes, markTypes);

    // Initialize plugins
    const ctx: PluginContext = {
      editor: this,
      commands: this.commandRegistry,
      keymap: this.keymapRegistry,
    };
    this.pluginRegistry.initAll(ctx);
  }

  // ─── State Access ──────────────────────────────────────

  getState(): ContentState {
    return this.stateManager.getState();
  }

  getDoc(): Document {
    return this.stateManager.getState().doc;
  }

  getSelection(): EditorSelection | null {
    return this.stateManager.getState().selection;
  }

  getSchema(): Schema {
    return this.schema;
  }

  // ─── Mutation ──────────────────────────────────────────

  dispatch(tr: Transaction): void {
    const prevState = this.stateManager.getState();

    // Run through plugin onTransaction pipeline
    const finalTr = this.pluginRegistry.runOnTransaction(tr, prevState);
    if (finalTr === null) return; // Rejected by plugin

    // Apply to state
    const nextState = this.stateManager.dispatch(finalTr);

    // Reconcile DOM
    if (this.editableElement && this.mounted) {
      this.reconciler.reconcile(prevState.doc, nextState.doc, this.editableElement);

      // Restore selection
      if (nextState.selection) {
        this.selectionManager.restore(nextState.selection);
      }
    }

    // Emit events
    this.eventBus.emit('state:change', { prevState, nextState });
    if (nextState.selection !== prevState.selection) {
      this.eventBus.emit('selection:change', { selection: nextState.selection });
    }

    // Run onUpdate hooks
    this.pluginRegistry.runOnUpdate(prevState, nextState);
  }

  applyOperations(ops: Operation[], origin: string = 'command'): void {
    this.dispatch({
      operations: ops,
      origin,
      timestamp: Date.now(),
    });
  }

  // ─── Commands ──────────────────────────────────────────

  executeCommand(name: string, args?: Record<string, unknown>): boolean {
    const result = this.commandRegistry.execute(name, args);
    if (result) {
      this.eventBus.emit('command:execute', { name, args });
    }
    return result;
  }

  // ─── Events ────────────────────────────────────────────

  on<K extends keyof EditorEvents>(
    event: K,
    handler: (data: EditorEvents[K]) => void,
  ): () => void {
    return this.eventBus.on(event, handler);
  }

  // ─── Lifecycle ─────────────────────────────────────────

  mount(container: HTMLElement): void {
    if (this.mounted) throw new Error('Editor already mounted');

    // Create root structure
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'nodius-editor';

    this.editableElement = document.createElement('div');
    this.editableElement.className = 'nodius-editable';
    this.editableElement.contentEditable = this.readOnly ? 'false' : 'true';
    this.editableElement.setAttribute('role', 'textbox');
    this.editableElement.setAttribute('aria-multiline', 'true');

    if (this.placeholder) {
      this.editableElement.setAttribute('data-placeholder', this.placeholder);
    }

    this.rootElement.appendChild(this.editableElement);
    container.appendChild(this.rootElement);

    // Set up selection manager
    this.selectionManager.setEditable(this.editableElement);

    // Initial render
    this.reconciler.renderToDOM(this.getDoc(), this.editableElement);

    // Attach event listeners
    this.attachEventListeners();
    this.mounted = true;

    // Notify plugins that DOM is ready
    this.eventBus.emit('mount', undefined);
  }

  destroy(): void {
    if (!this.mounted) return;

    this.detachEventListeners();
    this.pluginRegistry.destroyAll();
    this.eventBus.emit('destroy', undefined);
    this.eventBus.destroy();

    if (this.rootElement?.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }

    this.rootElement = null;
    this.editableElement = null;
    this.mounted = false;
  }

  getEditableElement(): HTMLElement | null {
    return this.editableElement;
  }

  getRootElement(): HTMLElement | null {
    return this.rootElement;
  }

  getCommands(): CommandRegistry {
    return this.commandRegistry;
  }

  getKeymap(): KeymapRegistry {
    return this.keymapRegistry;
  }

  getPlugins(): PluginRegistry {
    return this.pluginRegistry;
  }

  getToolbarConfig(): string[] | undefined {
    return this.toolbarConfig;
  }

  // ─── Event Handlers ────────────────────────────────────

  private attachEventListeners(): void {
    if (!this.editableElement) return;

    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleBeforeInput = this.handleBeforeInput.bind(this);
    this.boundHandleCompositionStart = this.handleCompositionStart.bind(this);
    this.boundHandleCompositionEnd = this.handleCompositionEnd.bind(this);
    this.boundHandleFocus = this.handleFocus.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);
    this.boundHandlePaste = this.handlePaste.bind(this);

    this.editableElement.addEventListener('keydown', this.boundHandleKeyDown);
    this.editableElement.addEventListener('beforeinput', this.boundHandleBeforeInput as EventListener);
    this.editableElement.addEventListener('compositionstart', this.boundHandleCompositionStart);
    this.editableElement.addEventListener('compositionend', this.boundHandleCompositionEnd as EventListener);
    this.editableElement.addEventListener('focus', this.boundHandleFocus);
    this.editableElement.addEventListener('blur', this.boundHandleBlur);
    this.editableElement.addEventListener('paste', this.boundHandlePaste as EventListener);

    this.boundHandleSelectionChange = this.handleSelectionChange.bind(this);
    document.addEventListener('selectionchange', this.boundHandleSelectionChange);
  }

  private detachEventListeners(): void {
    if (!this.editableElement) return;

    if (this.boundHandleKeyDown) this.editableElement.removeEventListener('keydown', this.boundHandleKeyDown);
    if (this.boundHandleBeforeInput) this.editableElement.removeEventListener('beforeinput', this.boundHandleBeforeInput as EventListener);
    if (this.boundHandleCompositionStart) this.editableElement.removeEventListener('compositionstart', this.boundHandleCompositionStart);
    if (this.boundHandleCompositionEnd) this.editableElement.removeEventListener('compositionend', this.boundHandleCompositionEnd as EventListener);
    if (this.boundHandleFocus) this.editableElement.removeEventListener('focus', this.boundHandleFocus);
    if (this.boundHandleBlur) this.editableElement.removeEventListener('blur', this.boundHandleBlur);
    if (this.boundHandlePaste) this.editableElement.removeEventListener('paste', this.boundHandlePaste as EventListener);
    if (this.boundHandleSelectionChange) document.removeEventListener('selectionchange', this.boundHandleSelectionChange);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Let plugins handle first
    const ctx: PluginContext = {
      editor: this,
      commands: this.commandRegistry,
      keymap: this.keymapRegistry,
    };
    if (this.pluginRegistry.runOnKeyDown(event, ctx)) return;

    // Then keymap
    this.keymapRegistry.handleKeyDown(event);
  }

  private handleBeforeInput(event: InputEvent): void {
    if (this.composing) return;
    if (this.readOnly) {
      event.preventDefault();
      return;
    }

    // Always prevent default for handled input types to keep DOM in sync with state
    const handledTypes = ['insertText', 'insertParagraph', 'insertLineBreak',
                          'deleteContentBackward', 'deleteContentForward'];
    if (handledTypes.includes(event.inputType)) {
      event.preventDefault();
    }

    // Try capturing current DOM selection; fall back to state selection
    let selection = this.selectionManager.capture();
    if (!selection) {
      selection = this.stateManager.getState().selection;
    }
    if (!selection) return;

    switch (event.inputType) {
      case 'insertText': {
        const text = event.data ?? '';
        if (!text) return;
        this.handleTextInsert(selection, text);
        break;
      }

      case 'insertParagraph':
      case 'insertLineBreak': {
        this.handleEnter(selection);
        break;
      }

      case 'deleteContentBackward': {
        this.handleBackspace(selection);
        break;
      }

      case 'deleteContentForward': {
        this.handleDelete(selection);
        break;
      }

      // Let other input types fall through to default browser behavior
    }
  }

  private handleCompositionStart(): void {
    this.composing = true;
  }

  private handleCompositionEnd(event: CompositionEvent): void {
    this.composing = false;
    // Handle the composed text
    const selection = this.selectionManager.capture();
    if (!selection || !event.data) return;
    this.handleTextInsert(selection, event.data);
  }

  private handleFocus(): void {
    this.eventBus.emit('focus', undefined);
  }

  private handleBlur(): void {
    this.eventBus.emit('blur', undefined);
  }

  private handleSelectionChange(): void {
    if (!this.editableElement || !this.mounted) return;

    // Only capture if selection is within our editable element
    const domSel = window.getSelection();
    if (!domSel || !domSel.rangeCount) return;
    const range = domSel.getRangeAt(0);
    if (!this.editableElement.contains(range.startContainer)) return;

    const selection = this.selectionManager.capture();
    if (!selection) return;

    // Protect range selections from being overwritten with collapsed ones
    // when focus is moving away (e.g., toolbar click). This prevents the
    // common browser issue where selectionchange fires before the toolbar
    // mousedown handler's preventDefault() takes effect.
    const newIsCollapsed = selection.anchor.blockIndex === selection.focus.blockIndex
                        && selection.anchor.offset === selection.focus.offset;
    if (newIsCollapsed) {
      const current = this.stateManager.getState().selection;
      if (current) {
        const currentIsRange = current.anchor.blockIndex !== current.focus.blockIndex
                            || current.anchor.offset !== current.focus.offset;
        if (currentIsRange && document.activeElement !== this.editableElement) {
          return; // Preserve the existing range selection
        }
      }
    }

    this.stateManager.setSelection(selection);
    this.eventBus.emit('selection:change', { selection });
  }

  private handlePaste(event: ClipboardEvent): void {
    // Basic text paste — plugins can intercept via onTransaction
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    const selection = this.selectionManager.capture();
    if (!selection) return;
    this.handleTextInsert(selection, text);
  }

  // ─── Input Helpers ─────────────────────────────────────

  private handleTextInsert(selection: EditorSelection, text: string): void {
    const ops: Operation[] = [];
    const { anchor, focus } = selection;

    // If there's a selection range, delete it first
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);
      ops.push({
        type: 'delete_text',
        path: [anchor.blockIndex, 0],
        offset: start,
        length: end - start,
      });
      // Insert at the start position
      ops.push({
        type: 'insert_text',
        path: [anchor.blockIndex, 0],
        offset: start,
        data: text,
      });

      const newSel: EditorSelection = {
        anchor: { blockIndex: anchor.blockIndex, path: [], offset: start + text.length },
        focus: { blockIndex: anchor.blockIndex, path: [], offset: start + text.length },
      };
      this.dispatch({ operations: ops, selection: newSel, origin: 'input', timestamp: Date.now() });
    } else {
      ops.push({
        type: 'insert_text',
        path: [anchor.blockIndex, 0],
        offset: anchor.offset,
        data: text,
      });
      const newSel: EditorSelection = {
        anchor: { ...anchor, offset: anchor.offset + text.length },
        focus: { ...anchor, offset: anchor.offset + text.length },
      };
      this.dispatch({ operations: ops, selection: newSel, origin: 'input', timestamp: Date.now() });
    }
  }

  private handleEnter(selection: EditorSelection): void {
    const { anchor } = selection;
    const doc = this.getDoc();
    const block = doc.children[anchor.blockIndex];
    if (!block) return;

    // Find which child node the offset falls in, and split there
    let remaining = anchor.offset;
    let splitChildIndex = 0;
    let splitTextOffset = 0;

    for (let i = 0; i < block.children.length; i++) {
      const child = block.children[i];
      if (child.kind === 'text') {
        if (remaining <= child.text.length) {
          splitChildIndex = i;
          splitTextOffset = remaining;
          break;
        }
        remaining -= child.text.length;
      }
      splitChildIndex = i + 1;
    }

    const ops: Operation[] = [];

    // If we're in the middle of a text node, split it first
    if (splitTextOffset > 0 && block.children[splitChildIndex]?.kind === 'text') {
      const textNode = block.children[splitChildIndex] as { text: string };
      if (splitTextOffset < textNode.text.length) {
        // We need to split the text node, then split the block
        // For simplicity, use split_node at the block level after adjusting
        // Split right after the text portion
        ops.push({
          type: 'split_node',
          path: [anchor.blockIndex],
          offset: splitChildIndex + 1,
        });
        // Then adjust the text in the first block (trim) and second block
        // Actually, split_node splits at child boundary, not text boundary
        // We need a different approach for mid-text splits
      }
    }

    // Simplified: split block at child index
    // If cursor is at end of all text, this creates an empty new block
    if (ops.length === 0) {
      ops.push({
        type: 'split_node',
        path: [anchor.blockIndex],
        offset: block.children.length,
      });
    }

    const newSel: EditorSelection = {
      anchor: { blockIndex: anchor.blockIndex + 1, path: [], offset: 0 },
      focus: { blockIndex: anchor.blockIndex + 1, path: [], offset: 0 },
    };

    this.dispatch({ operations: ops, selection: newSel, origin: 'input', timestamp: Date.now() });
  }

  private handleBackspace(selection: EditorSelection): void {
    const { anchor, focus } = selection;

    // If there's a selection, delete the range
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, 0],
          offset: start,
          length: end - start,
        }],
        selection: {
          anchor: { ...anchor, offset: start },
          focus: { ...anchor, offset: start },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // At beginning of a block — merge with previous
    if (anchor.offset === 0 && anchor.blockIndex > 0) {
      const prevBlock = this.getDoc().children[anchor.blockIndex - 1];
      let prevLength = 0;
      for (const child of prevBlock.children) {
        if (child.kind === 'text') prevLength += child.text.length;
      }

      this.dispatch({
        operations: [{
          type: 'merge_nodes',
          path: [],
          offset: anchor.blockIndex,
        }],
        selection: {
          anchor: { blockIndex: anchor.blockIndex - 1, path: [], offset: prevLength },
          focus: { blockIndex: anchor.blockIndex - 1, path: [], offset: prevLength },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // Delete one character before cursor
    if (anchor.offset > 0) {
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, 0],
          offset: anchor.offset - 1,
          length: 1,
        }],
        selection: {
          anchor: { ...anchor, offset: anchor.offset - 1 },
          focus: { ...anchor, offset: anchor.offset - 1 },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
    }
  }

  private handleDelete(selection: EditorSelection): void {
    const { anchor, focus } = selection;
    const doc = this.getDoc();
    const block = doc.children[anchor.blockIndex];
    if (!block) return;

    // Selection range delete
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, 0],
          offset: start,
          length: end - start,
        }],
        selection: {
          anchor: { ...anchor, offset: start },
          focus: { ...anchor, offset: start },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // Calculate block text length
    let blockLength = 0;
    for (const child of block.children) {
      if (child.kind === 'text') blockLength += child.text.length;
    }

    // At end of block — merge with next
    if (anchor.offset >= blockLength && anchor.blockIndex < doc.children.length - 1) {
      this.dispatch({
        operations: [{
          type: 'merge_nodes',
          path: [],
          offset: anchor.blockIndex + 1,
        }],
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // Delete one character after cursor
    if (anchor.offset < blockLength) {
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, 0],
          offset: anchor.offset,
          length: 1,
        }],
        origin: 'input',
        timestamp: Date.now(),
      });
    }
  }
}

// ─── Factory Function ────────────────────────────────────────

export function createEditor(config: EditorConfig = {}): CoreEditor {
  return new CoreEditor(config);
}
