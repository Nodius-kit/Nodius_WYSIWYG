import { describe, it, expect, vi } from 'vitest';
import { HistoryManager, createHistoryPlugin } from '../../src/core/history';
import type { ContentState, Transaction } from '../../src/core/types';
import { createDocWith, getBlockText } from '../helpers';

describe('HistoryManager', () => {
  function makeState(text: string): ContentState {
    return { doc: createDocWith([{ type: 'paragraph', text }]), selection: null };
  }

  it('should push and pop undo entries', () => {
    const hm = new HistoryManager(100, 0); // 0 delay for testing
    const state = makeState('Hello');
    hm.push(state);
    expect(hm.canUndo()).toBe(true);
    const entry = hm.undo();
    expect(entry).not.toBeNull();
    expect(getBlockText(entry!.doc, 0)).toBe('Hello');
  });

  it('should track redo stack', () => {
    const hm = new HistoryManager(100, 0);
    const state1 = makeState('First');
    hm.push(state1);
    expect(hm.canRedo()).toBe(false);

    hm.pushToRedo(makeState('Second'));
    expect(hm.canRedo()).toBe(true);

    const entry = hm.redo();
    expect(entry).not.toBeNull();
    expect(getBlockText(entry!.doc, 0)).toBe('Second');
  });

  it('should clear redo on new push', () => {
    const hm = new HistoryManager(100, 0);
    hm.push(makeState('A'));
    hm.pushToRedo(makeState('B'));
    expect(hm.canRedo()).toBe(true);

    hm.push(makeState('C'));
    expect(hm.canRedo()).toBe(false);
  });

  it('should enforce max entries', () => {
    const hm = new HistoryManager(3, 0);
    hm.push(makeState('A'));
    hm.push(makeState('B'));
    hm.push(makeState('C'));
    hm.push(makeState('D'));

    expect(hm.getUndoStackSize()).toBe(3);
  });

  it('should debounce rapid pushes', () => {
    const hm = new HistoryManager(100, 1000);
    hm.push(makeState('A'));
    hm.push(makeState('B')); // Within 1000ms — should be skipped

    expect(hm.getUndoStackSize()).toBe(1);
    const entry = hm.undo();
    expect(getBlockText(entry!.doc, 0)).toBe('A');
  });

  it('should return null when nothing to undo', () => {
    const hm = new HistoryManager();
    expect(hm.undo()).toBeNull();
    expect(hm.canUndo()).toBe(false);
  });

  it('should return null when nothing to redo', () => {
    const hm = new HistoryManager();
    expect(hm.redo()).toBeNull();
    expect(hm.canRedo()).toBe(false);
  });

  it('should clear all stacks', () => {
    const hm = new HistoryManager(100, 0);
    hm.push(makeState('A'));
    hm.pushToRedo(makeState('B'));
    hm.clear();
    expect(hm.canUndo()).toBe(false);
    expect(hm.canRedo()).toBe(false);
  });
});

describe('createHistoryPlugin', () => {
  it('should create plugin and history manager', () => {
    const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
    expect(plugin.name).toBe('history');
    expect(history).toBeInstanceOf(HistoryManager);
  });

  it('should not record history:undo transactions', () => {
    const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
    const state = { doc: createDocWith([{ type: 'paragraph', text: 'Test' }]), selection: null };
    const tr: Transaction = { operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }], origin: 'history:undo', timestamp: Date.now() };

    plugin.onTransaction!(tr, state);
    expect(history.canUndo()).toBe(false);
  });

  it('should not record history:redo transactions', () => {
    const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
    const state = { doc: createDocWith([{ type: 'paragraph', text: 'Test' }]), selection: null };
    const tr: Transaction = { operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }], origin: 'history:redo', timestamp: Date.now() };

    plugin.onTransaction!(tr, state);
    expect(history.canUndo()).toBe(false);
  });

  it('should record normal transactions', () => {
    const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
    const state = { doc: createDocWith([{ type: 'paragraph', text: 'Test' }]), selection: null };
    const tr: Transaction = { operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }], origin: 'input', timestamp: Date.now() };

    plugin.onTransaction!(tr, state);
    expect(history.canUndo()).toBe(true);
  });

  it('should not record remote transactions', () => {
    const { plugin, history } = createHistoryPlugin({ batchDelay: 0 });
    const state = { doc: createDocWith([{ type: 'paragraph', text: 'Test' }]), selection: null };
    const tr: Transaction = { operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }], origin: 'remote', timestamp: Date.now() };

    plugin.onTransaction!(tr, state);
    expect(history.canUndo()).toBe(false);
  });
});
