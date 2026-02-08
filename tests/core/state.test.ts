import { describe, it, expect, vi } from 'vitest';
import { StateManager } from '../../src/core/state';
import type { Transaction, Operation, ContentState } from '../../src/core/types';
import { createDocWith, getBlockText } from '../helpers';

describe('StateManager', () => {
  describe('createEmptyDocument', () => {
    it('should create a document with one empty paragraph', () => {
      const doc = StateManager.createEmptyDocument();
      expect(doc.kind).toBe('document');
      expect(doc.children).toHaveLength(1);
      expect(doc.children[0].type).toBe('paragraph');
      expect(doc.children[0].children).toHaveLength(1);
      expect(doc.children[0].children[0].kind).toBe('text');
      expect((doc.children[0].children[0] as { text: string }).text).toBe('');
      expect(doc.version).toBe(0);
    });

    it('should generate unique IDs', () => {
      const doc1 = StateManager.createEmptyDocument();
      const doc2 = StateManager.createEmptyDocument();
      expect(doc1.id).not.toBe(doc2.id);
    });
  });

  describe('createEmptyState', () => {
    it('should create state with empty doc and null selection', () => {
      const state = StateManager.createEmptyState();
      expect(state.doc).toBeDefined();
      expect(state.selection).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const sm = new StateManager();
      const state = sm.getState();
      expect(state.doc.kind).toBe('document');
      expect(state.selection).toBeNull();
    });

    it('should accept initial state', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const sm = new StateManager({ doc, selection: null });
      expect(getBlockText(sm.getState().doc, 0)).toBe('Hello');
    });
  });

  describe('dispatch', () => {
    it('should apply insert_text operation', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const sm = new StateManager({ doc, selection: null });

      const tr: Transaction = {
        operations: [
          { type: 'insert_text', path: [0, 0], offset: 5, data: ' World' },
        ],
        origin: 'test',
        timestamp: Date.now(),
      };

      sm.dispatch(tr);
      expect(getBlockText(sm.getState().doc, 0)).toBe('Hello World');
    });

    it('should bump version after dispatch', () => {
      const sm = new StateManager();
      const initialVersion = sm.getState().doc.version;

      sm.dispatch({
        operations: [
          { type: 'insert_text', path: [0, 0], offset: 0, data: 'Hi' },
        ],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(sm.getState().doc.version).toBe(initialVersion + 1);
    });

    it('should update selection from transaction', () => {
      const sm = new StateManager();
      const sel = {
        anchor: { blockIndex: 0, path: [0, 0], offset: 2 },
        focus: { blockIndex: 0, path: [0, 0], offset: 2 },
      };

      sm.dispatch({
        operations: [],
        selection: sel,
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(sm.getState().selection).toEqual(sel);
    });

    it('should use tr.doc directly when provided (history restore)', () => {
      const sm = new StateManager();
      const restoredDoc = createDocWith([{ type: 'paragraph', text: 'Restored' }]);

      sm.dispatch({
        operations: [],
        doc: restoredDoc,
        origin: 'history:undo',
        timestamp: Date.now(),
      });

      expect(getBlockText(sm.getState().doc, 0)).toBe('Restored');
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on dispatch', () => {
      const sm = new StateManager();
      const listener = vi.fn();
      sm.subscribe(listener);

      sm.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should pass prev and next state to listener', () => {
      const sm = new StateManager();
      let captured: { prev: ContentState; next: ContentState } | null = null;

      sm.subscribe((prev, next) => {
        captured = { prev, next };
      });

      sm.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'A' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(captured).not.toBeNull();
      expect(getBlockText(captured!.prev.doc, 0)).toBe('');
      expect(getBlockText(captured!.next.doc, 0)).toBe('A');
    });

    it('should unsubscribe when returned function is called', () => {
      const sm = new StateManager();
      const listener = vi.fn();
      const unsub = sm.subscribe(listener);

      unsub();

      sm.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const sm = new StateManager();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      sm.subscribe(listener1);
      sm.subscribe(listener2);

      sm.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        origin: 'test',
        timestamp: Date.now(),
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });
  });
});
