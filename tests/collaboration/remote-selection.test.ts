import { describe, it, expect } from 'vitest';
import { SelectionManager } from '../../src/core/selection';
import type { EditorSelection, Operation } from '../../src/core/types';

describe('Remote selection mapping', () => {
  const sm = new SelectionManager();

  function sel(blockIndex: number, offset: number): EditorSelection {
    return {
      anchor: { blockIndex, path: [], offset },
      focus: { blockIndex, path: [], offset },
    };
  }

  it('should shift cursor right when remote inserts text before cursor', () => {
    const localSel = sel(0, 5);
    const ops: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(7); // 5 + 2
    expect(mapped.focus.offset).toBe(7);
  });

  it('should not shift cursor when remote inserts text after cursor', () => {
    const localSel = sel(0, 3);
    const ops: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 5, data: 'YY' },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(3);
  });

  it('should shift cursor left when remote deletes text before cursor', () => {
    const localSel = sel(0, 8);
    const ops: Operation[] = [
      { type: 'delete_text', path: [0, 0], offset: 2, length: 3 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(5); // 8 - 3
  });

  it('should not shift cursor when remote deletes text after cursor', () => {
    const localSel = sel(0, 3);
    const ops: Operation[] = [
      { type: 'delete_text', path: [0, 0], offset: 5, length: 2 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(3);
  });

  it('should snap cursor to deletion start when cursor is inside deleted range', () => {
    const localSel = sel(0, 5);
    const ops: Operation[] = [
      { type: 'delete_text', path: [0, 0], offset: 3, length: 5 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.offset).toBe(3);
  });

  it('should shift blockIndex when remote inserts a block before cursor block', () => {
    const localSel = sel(2, 5);
    const ops: Operation[] = [
      { type: 'insert_node', path: [], offset: 1, data: {} as any },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(3);
  });

  it('should not shift blockIndex when remote inserts block after cursor block', () => {
    const localSel = sel(1, 3);
    const ops: Operation[] = [
      { type: 'insert_node', path: [], offset: 5, data: {} as any },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(1);
  });

  it('should shift blockIndex when remote deletes a block before cursor block', () => {
    const localSel = sel(3, 2);
    const ops: Operation[] = [
      { type: 'delete_node', path: [], offset: 1 },
    ];
    const mapped = sm.mapThrough(localSel, ops);
    expect(mapped.anchor.blockIndex).toBe(2);
  });
});
