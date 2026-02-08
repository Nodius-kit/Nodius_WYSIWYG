import type {
  Document,
  EditorSelection,
  ContentState,
  Transaction,
  PluginDefinition,
  PluginContext,
  EditorInterface,
} from './types';

interface HistoryEntry {
  readonly doc: Document;
  readonly selection: EditorSelection | null;
  readonly timestamp: number;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxEntries: number;
  private batchDelay: number;
  private lastPushTime = 0;

  constructor(maxEntries = 100, batchDelay = 500) {
    this.maxEntries = maxEntries;
    this.batchDelay = batchDelay;
  }

  push(state: ContentState): void {
    const now = Date.now();
    const entry: HistoryEntry = {
      doc: state.doc,
      selection: state.selection,
      timestamp: now,
    };

    // Debounce: if last push was recent, replace the top instead of pushing
    if (this.undoStack.length > 0 && (now - this.lastPushTime) < this.batchDelay) {
      // Don't replace — keep the older snapshot so undo goes back further
      // Just skip this push (the batching means we don't record every keystroke)
      this.lastPushTime = now;
      return;
    }

    this.undoStack.push(entry);
    this.lastPushTime = now;

    // Enforce max size
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }

    // Any new push clears redo
    this.redoStack.length = 0;
  }

  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    return entry;
  }

  pushToRedo(state: ContentState): void {
    this.redoStack.push({
      doc: state.doc,
      selection: state.selection,
      timestamp: Date.now(),
    });
  }

  pushToUndo(state: ContentState): void {
    this.undoStack.push({
      doc: state.doc,
      selection: state.selection,
      timestamp: Date.now(),
    });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  getRedoStackSize(): number {
    return this.redoStack.length;
  }
}

// ─── History Plugin ──────────────────────────────────────────

export function createHistoryPlugin(opts?: { maxEntries?: number; batchDelay?: number }): {
  plugin: PluginDefinition;
  history: HistoryManager;
} {
  const history = new HistoryManager(opts?.maxEntries, opts?.batchDelay);
  let editorRef: EditorInterface | null = null;

  const plugin: PluginDefinition = {
    name: 'history',

    init(ctx: PluginContext) {
      editorRef = ctx.editor;

      ctx.commands.register('undo', (editor) => {
        const currentState = editor.getState();
        const entry = history.undo();
        if (!entry) return false;

        // Push current to redo
        history.pushToRedo(currentState);

        editor.dispatch({
          operations: [],
          doc: entry.doc,
          selection: entry.selection,
          origin: 'history:undo',
          timestamp: Date.now(),
        });
        return true;
      });

      ctx.commands.register('redo', (editor) => {
        const currentState = editor.getState();
        const entry = history.redo();
        if (!entry) return false;

        // Push current to undo
        history.pushToUndo(currentState);

        editor.dispatch({
          operations: [],
          doc: entry.doc,
          selection: entry.selection,
          origin: 'history:redo',
          timestamp: Date.now(),
        });
        return true;
      });

      ctx.keymap.register('Mod-z', 'undo');
      ctx.keymap.register('Mod-Shift-z', 'redo');
    },

    onTransaction(tr: Transaction, state: ContentState): Transaction | undefined {
      // Don't record history/undo/redo transactions in history
      if (tr.origin === 'history:undo' || tr.origin === 'history:redo') {
        return undefined;
      }

      // Don't record remote operations (collaboration)
      if (tr.origin === 'remote') {
        return undefined;
      }

      // Record current state before the transaction is applied
      if (tr.operations.length > 0 || tr.doc) {
        history.push(state);
      }

      return undefined; // passthrough
    },
  };

  return { plugin, history };
}
