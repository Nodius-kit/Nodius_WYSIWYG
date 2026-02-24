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
  TextNode,
  Mark,
} from './types';
import { generateId } from './types';
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

    // For remote transactions without explicit selection, map local selection through incoming ops
    let adjustedTr = finalTr;
    if (finalTr.origin === 'remote' && finalTr.selection === undefined && prevState.selection) {
      const mappedSelection = this.selectionManager.mapThrough(prevState.selection, finalTr.operations);
      adjustedTr = { ...finalTr, selection: mappedSelection };
    }

    // Apply to state
    const nextState = this.stateManager.dispatch(adjustedTr);

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

    // Void block deletion via Backspace/Delete.
    // `beforeinput` doesn't fire when the DOM selection is cleared
    // (which happens for void blocks via removeAllRanges in restore()),
    // so handle it here from the state selection.
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (event.defaultPrevented) return;
      const selection = this.stateManager.getState().selection;
      if (!selection) return;
      const block = this.getDoc().children[selection.anchor.blockIndex];
      if (!block) return;
      const spec = this.schema.getNodeType(block.type);
      if (spec?.group !== 'void') return;

      event.preventDefault();
      const ops: Operation[] = [{ type: 'delete_node', path: [], offset: selection.anchor.blockIndex }];
      const docLen = this.getDoc().children.length;
      if (docLen === 1) {
        ops.push({
          type: 'insert_node', path: [], offset: 0,
          data: {
            id: generateId(), kind: 'element' as const, type: 'paragraph', attrs: {},
            children: [{ id: generateId(), kind: 'text' as const, text: '', marks: [] as const }],
          },
        });
      }
      const newBlockIndex = docLen === 1 ? 0 : Math.max(0, selection.anchor.blockIndex - 1);
      this.dispatch({
        operations: ops,
        selection: {
          anchor: { blockIndex: newBlockIndex, path: [], offset: 0 },
          focus: { blockIndex: newBlockIndex, path: [], offset: 0 },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
    }
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

    // Clear stored marks only when cursor actually moves position
    const currentSel = this.stateManager.getState().selection;
    if (this.stateManager.getState().storedMarks && currentSel) {
      const posChanged =
        selection.anchor.blockIndex !== currentSel.anchor.blockIndex ||
        selection.anchor.offset !== currentSel.anchor.offset ||
        selection.focus.blockIndex !== currentSel.focus.blockIndex ||
        selection.focus.offset !== currentSel.focus.offset;
      if (posChanged) {
        this.stateManager.setStoredMarks(null);
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

  // ─── Position Resolution ─────────────────────────────────

  private resolveTextPosition(blockIndex: number, charOffset: number): { childIndex: number; localOffset: number } {
    const block = this.getDoc().children[blockIndex];
    if (!block) return { childIndex: 0, localOffset: charOffset };
    let remaining = charOffset;
    for (let i = 0; i < block.children.length; i++) {
      const child = block.children[i];
      if (child.kind === 'text') {
        if (remaining <= child.text.length) {
          return { childIndex: i, localOffset: remaining };
        }
        remaining -= child.text.length;
      }
    }
    // Past end: target last text node
    for (let i = block.children.length - 1; i >= 0; i--) {
      if (block.children[i].kind === 'text') {
        const t = block.children[i] as TextNode;
        return { childIndex: i, localOffset: t.text.length };
      }
    }
    return { childIndex: 0, localOffset: 0 };
  }

  // ─── Range Deletion Helper ──────────────────────────────

  private createDeleteRangeOps(blockIndex: number, start: number, end: number): Operation[] {
    const block = this.getDoc().children[blockIndex];
    if (!block) return [];

    const ops: Operation[] = [];
    let charPos = 0;

    for (let i = 0; i < block.children.length; i++) {
      const child = block.children[i];
      if (child.kind !== 'text') continue;

      const nodeStart = charPos;
      const nodeEnd = charPos + child.text.length;
      charPos = nodeEnd;

      if (nodeEnd <= start || nodeStart >= end) continue;

      const delStart = Math.max(start, nodeStart) - nodeStart;
      const delEnd = Math.min(end, nodeEnd) - nodeStart;
      const delLength = delEnd - delStart;

      if (delLength > 0) {
        ops.push({
          type: 'delete_text',
          path: [blockIndex, i],
          offset: delStart,
          length: delLength,
        });
      }
    }

    return ops;
  }

  // ─── Cross-Block Deletion ─────────────────────────────

  private getBlockTextLength(blockIndex: number): number {
    const block = this.getDoc().children[blockIndex];
    if (!block) return 0;
    let len = 0;
    for (const child of block.children) {
      if (child.kind === 'text') len += child.text.length;
    }
    return len;
  }

  private createCrossBlockDeleteOps(selection: EditorSelection): { ops: Operation[]; startBlockIdx: number; startOffset: number } {
    const { anchor, focus } = selection;
    const startBlockIdx = Math.min(anchor.blockIndex, focus.blockIndex);
    const endBlockIdx = Math.max(anchor.blockIndex, focus.blockIndex);
    const startOffset = anchor.blockIndex < focus.blockIndex ? anchor.offset : focus.offset;
    const endOffset = anchor.blockIndex < focus.blockIndex ? focus.offset : anchor.offset;

    const ops: Operation[] = [];

    // 1. Delete text in start block from startOffset to end
    const startBlockLen = this.getBlockTextLength(startBlockIdx);
    if (startOffset < startBlockLen) {
      ops.push(...this.createDeleteRangeOps(startBlockIdx, startOffset, startBlockLen));
    }

    // 2. Delete text in end block from 0 to endOffset
    if (endOffset > 0) {
      ops.push(...this.createDeleteRangeOps(endBlockIdx, 0, endOffset));
    }

    // 3. Delete intermediate blocks (reverse order to keep indices stable)
    for (let i = endBlockIdx - 1; i > startBlockIdx; i--) {
      ops.push({ type: 'delete_node', path: [], offset: i });
    }

    // 4. Merge end block (now at startBlockIdx + 1) into start block
    ops.push({ type: 'merge_nodes', path: [], offset: startBlockIdx + 1 });

    return { ops, startBlockIdx, startOffset };
  }

  // ─── Input Helpers ─────────────────────────────────────

  private handleTextInsert(selection: EditorSelection, text: string): void {
    const ops: Operation[] = [];
    const { anchor, focus } = selection;
    const storedMarks = this.stateManager.getState().storedMarks;

    // Cross-block selection: delete range then insert
    if (anchor.blockIndex !== focus.blockIndex) {
      const { ops: deleteOps, startBlockIdx, startOffset } = this.createCrossBlockDeleteOps(selection);
      ops.push(...deleteOps);

      // Insert text at the merge point (text before startOffset is unchanged, so resolveTextPosition is valid)
      const insPos = this.resolveTextPosition(startBlockIdx, startOffset);
      ops.push({
        type: 'insert_text',
        path: [startBlockIdx, insPos.childIndex],
        offset: insPos.localOffset,
        data: text,
      });

      // Handle stored marks
      if (storedMarks !== null && storedMarks !== undefined) {
        const inheritedMarks = this.getInheritedMarks(startBlockIdx, startOffset);
        for (const inherited of inheritedMarks) {
          if (!storedMarks.some((m) => m.type === inherited.type)) {
            ops.push({ type: 'remove_mark', path: [startBlockIdx], offset: startOffset, length: text.length, mark: { type: inherited.type } });
          }
        }
        for (const mark of storedMarks) {
          if (!inheritedMarks.some((m) => m.type === mark.type)) {
            ops.push({ type: 'add_mark', path: [startBlockIdx], offset: startOffset, length: text.length, mark });
          }
        }
      }

      const newSel: EditorSelection = {
        anchor: { blockIndex: startBlockIdx, path: [], offset: startOffset + text.length },
        focus: { blockIndex: startBlockIdx, path: [], offset: startOffset + text.length },
      };
      this.dispatch({ operations: ops, selection: newSel, storedMarks: storedMarks !== null && storedMarks !== undefined ? null : undefined, origin: 'input', timestamp: Date.now() });
      return;
    }

    // Same-block range selection: delete it first
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);

      // Generate per-child delete ops (handles multi-node selections)
      ops.push(...this.createDeleteRangeOps(anchor.blockIndex, start, end));

      // Insert at the start position (childIndex is stable after delete_text ops)
      const insPos = this.resolveTextPosition(anchor.blockIndex, start);
      ops.push({
        type: 'insert_text',
        path: [anchor.blockIndex, insPos.childIndex],
        offset: insPos.localOffset,
        data: text,
      });

      // When storedMarks is set (even empty []), enforce it on inserted text
      if (storedMarks !== null && storedMarks !== undefined) {
        // Remove inherited marks not in storedMarks
        const inheritedMarks = this.getInheritedMarks(anchor.blockIndex, start);
        for (const inherited of inheritedMarks) {
          if (!storedMarks.some((m) => m.type === inherited.type)) {
            ops.push({ type: 'remove_mark', path: [anchor.blockIndex], offset: start, length: text.length, mark: { type: inherited.type } });
          }
        }
        // Add storedMarks not already inherited
        for (const mark of storedMarks) {
          if (!inheritedMarks.some((m) => m.type === mark.type)) {
            ops.push({ type: 'add_mark', path: [anchor.blockIndex], offset: start, length: text.length, mark });
          }
        }
      }

      const newSel: EditorSelection = {
        anchor: { blockIndex: anchor.blockIndex, path: [], offset: start + text.length },
        focus: { blockIndex: anchor.blockIndex, path: [], offset: start + text.length },
      };
      this.dispatch({ operations: ops, selection: newSel, storedMarks: storedMarks !== null && storedMarks !== undefined ? null : undefined, origin: 'input', timestamp: Date.now() });
    } else {
      const pos = this.resolveTextPosition(anchor.blockIndex, anchor.offset);
      ops.push({
        type: 'insert_text',
        path: [anchor.blockIndex, pos.childIndex],
        offset: pos.localOffset,
        data: text,
      });

      // When storedMarks is set (even empty []), enforce it on inserted text
      if (storedMarks !== null && storedMarks !== undefined) {
        // Remove inherited marks not in storedMarks
        const inheritedMarks = this.getInheritedMarks(anchor.blockIndex, anchor.offset);
        for (const inherited of inheritedMarks) {
          if (!storedMarks.some((m) => m.type === inherited.type)) {
            ops.push({ type: 'remove_mark', path: [anchor.blockIndex], offset: anchor.offset, length: text.length, mark: { type: inherited.type } });
          }
        }
        // Add storedMarks not already inherited
        for (const mark of storedMarks) {
          if (!inheritedMarks.some((m) => m.type === mark.type)) {
            ops.push({ type: 'add_mark', path: [anchor.blockIndex], offset: anchor.offset, length: text.length, mark });
          }
        }
      }

      const newSel: EditorSelection = {
        anchor: { ...anchor, offset: anchor.offset + text.length },
        focus: { ...anchor, offset: anchor.offset + text.length },
      };
      this.dispatch({ operations: ops, selection: newSel, storedMarks: storedMarks !== null && storedMarks !== undefined ? null : undefined, origin: 'input', timestamp: Date.now() });
    }
  }

  private getInheritedMarks(blockIndex: number, charOffset: number): readonly Mark[] {
    const block = this.getDoc().children[blockIndex];
    if (!block) return [];
    let pos = 0;
    for (const child of block.children) {
      if (child.kind === 'text') {
        const end = pos + child.text.length;
        if (charOffset >= pos && charOffset <= end) {
          return child.marks;
        }
        pos = end;
      }
    }
    return [];
  }

  private handleEnter(selection: EditorSelection): void {
    const { anchor } = selection;
    const doc = this.getDoc();
    const block = doc.children[anchor.blockIndex];
    if (!block) return;

    // 1. Void block → insert empty paragraph after
    const spec = this.schema.getNodeType(block.type);
    if (spec?.group === 'void') {
      const emptyParagraph = {
        id: generateId(),
        kind: 'element' as const,
        type: 'paragraph',
        attrs: {},
        children: [{ id: generateId(), kind: 'text' as const, text: '', marks: [] as const }],
      };
      this.dispatch({
        operations: [{ type: 'insert_node', path: [], offset: anchor.blockIndex + 1, data: emptyParagraph }],
        selection: {
          anchor: { blockIndex: anchor.blockIndex + 1, path: [], offset: 0 },
          focus: { blockIndex: anchor.blockIndex + 1, path: [], offset: 0 },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // 2. Resolve position in text node
    const { childIndex, localOffset } = this.resolveTextPosition(anchor.blockIndex, anchor.offset);
    const child = block.children[childIndex];
    const ops: Operation[] = [];

    // 3. If mid-text, split the text node first, then split the block
    if (child?.kind === 'text' && localOffset > 0 && localOffset < child.text.length) {
      const afterText = child.text.slice(localOffset);
      // Delete text after cursor from current text node
      ops.push({
        type: 'delete_text',
        path: [anchor.blockIndex, childIndex],
        offset: localOffset,
        length: child.text.length - localOffset,
      });
      // Split block after current child (all children after childIndex go to new block)
      ops.push({
        type: 'split_node',
        path: [anchor.blockIndex],
        offset: childIndex + 1,
      });
      // Insert the remaining text at start of new block's first text node
      ops.push({
        type: 'insert_text',
        path: [anchor.blockIndex + 1, 0],
        offset: 0,
        data: afterText,
      });
    } else {
      // At child boundary — simple split
      const splitAt = (child?.kind === 'text' && localOffset === child.text.length) ? childIndex + 1 : childIndex;
      ops.push({
        type: 'split_node',
        path: [anchor.blockIndex],
        offset: splitAt,
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

    // Cross-block selection: delete entire range
    if (anchor.blockIndex !== focus.blockIndex) {
      const { ops, startBlockIdx, startOffset } = this.createCrossBlockDeleteOps(selection);
      this.dispatch({
        operations: ops,
        selection: {
          anchor: { blockIndex: startBlockIdx, path: [], offset: startOffset },
          focus: { blockIndex: startBlockIdx, path: [], offset: startOffset },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    // Void block deletion (image, HR, etc.)
    const voidBlock = this.getDoc().children[anchor.blockIndex];
    if (voidBlock) {
      const voidSpec = this.schema.getNodeType(voidBlock.type);
      if (voidSpec?.group === 'void') {
        const ops: Operation[] = [{ type: 'delete_node', path: [], offset: anchor.blockIndex }];
        const docLen = this.getDoc().children.length;
        if (docLen === 1) {
          ops.push({
            type: 'insert_node', path: [], offset: 0,
            data: {
              id: generateId(), kind: 'element' as const, type: 'paragraph', attrs: {},
              children: [{ id: generateId(), kind: 'text' as const, text: '', marks: [] as const }],
            },
          });
        }
        const newBlockIndex = docLen === 1 ? 0 : Math.max(0, anchor.blockIndex - 1);
        this.dispatch({
          operations: ops,
          selection: { anchor: { blockIndex: newBlockIndex, path: [], offset: 0 }, focus: { blockIndex: newBlockIndex, path: [], offset: 0 } },
          origin: 'input', timestamp: Date.now(),
        });
        return;
      }
    }

    // If there's a selection, delete the range (may span multiple text nodes)
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);
      this.dispatch({
        operations: this.createDeleteRangeOps(anchor.blockIndex, start, end),
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
      const pos = this.resolveTextPosition(anchor.blockIndex, anchor.offset - 1);
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, pos.childIndex],
          offset: pos.localOffset,
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

    // Cross-block selection: delete entire range
    if (anchor.blockIndex !== focus.blockIndex) {
      const { ops, startBlockIdx, startOffset } = this.createCrossBlockDeleteOps(selection);
      this.dispatch({
        operations: ops,
        selection: {
          anchor: { blockIndex: startBlockIdx, path: [], offset: startOffset },
          focus: { blockIndex: startBlockIdx, path: [], offset: startOffset },
        },
        origin: 'input',
        timestamp: Date.now(),
      });
      return;
    }

    const doc = this.getDoc();
    const block = doc.children[anchor.blockIndex];
    if (!block) return;

    // Void block deletion (image, HR, etc.)
    const delSpec = this.schema.getNodeType(block.type);
    if (delSpec?.group === 'void') {
      const ops: Operation[] = [{ type: 'delete_node', path: [], offset: anchor.blockIndex }];
      if (doc.children.length === 1) {
        ops.push({
          type: 'insert_node', path: [], offset: 0,
          data: {
            id: generateId(), kind: 'element' as const, type: 'paragraph', attrs: {},
            children: [{ id: generateId(), kind: 'text' as const, text: '', marks: [] as const }],
          },
        });
      }
      const newBlockIndex = doc.children.length === 1 ? 0 : Math.min(anchor.blockIndex, doc.children.length - 2);
      this.dispatch({
        operations: ops,
        selection: { anchor: { blockIndex: newBlockIndex, path: [], offset: 0 }, focus: { blockIndex: newBlockIndex, path: [], offset: 0 } },
        origin: 'input', timestamp: Date.now(),
      });
      return;
    }

    // Selection range delete (may span multiple text nodes)
    if (anchor.blockIndex === focus.blockIndex && anchor.offset !== focus.offset) {
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);
      this.dispatch({
        operations: this.createDeleteRangeOps(anchor.blockIndex, start, end),
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
      const pos = this.resolveTextPosition(anchor.blockIndex, anchor.offset);
      this.dispatch({
        operations: [{
          type: 'delete_text',
          path: [anchor.blockIndex, pos.childIndex],
          offset: pos.localOffset,
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
