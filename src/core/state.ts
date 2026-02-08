import type { ContentState, Document, Transaction, EditorSelection } from './types';
import { generateId, createElement, createTextNode } from './types';
import { applyTransaction } from './operations';

export class StateManager {
  private state: ContentState;
  private listeners: Set<(prevState: ContentState, nextState: ContentState) => void> = new Set();

  constructor(initialState?: ContentState) {
    this.state = initialState ?? StateManager.createEmptyState();
  }

  getState(): ContentState {
    return this.state;
  }

  dispatch(tr: Transaction): ContentState {
    const prevState = this.state;

    // If tr.doc is provided, use it directly (e.g. history restore)
    if (tr.doc) {
      this.state = {
        doc: tr.doc,
        selection: tr.selection !== undefined ? tr.selection : prevState.selection,
      };
    } else {
      this.state = applyTransaction(prevState, tr);
    }

    // Override selection if transaction specifies one
    if (tr.selection !== undefined) {
      this.state = { ...this.state, selection: tr.selection };
    }

    for (const listener of this.listeners) {
      listener(prevState, this.state);
    }

    return this.state;
  }

  setSelection(selection: EditorSelection | null): void {
    this.state = { ...this.state, selection };
  }

  subscribe(listener: (prevState: ContentState, nextState: ContentState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  static createEmptyDocument(): Document {
    return {
      id: generateId(),
      kind: 'document',
      children: [
        createElement('paragraph', {}, [createTextNode('')]),
      ],
      version: 0,
    };
  }

  static createEmptyState(): ContentState {
    return {
      doc: StateManager.createEmptyDocument(),
      selection: null,
    };
  }
}
