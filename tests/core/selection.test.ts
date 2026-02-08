import { describe, it, expect } from 'vitest';
import { SelectionManager } from '../../src/core/selection';
import type { Position, Operation } from '../../src/core/types';

describe('SelectionManager', () => {
  describe('mapPositionThrough', () => {
    const sm = new SelectionManager();

    it('should shift offset right on insert_text before position', () => {
      const pos: Position = { blockIndex: 0, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(7); // 5 + 2
    });

    it('should not shift offset on insert_text after position', () => {
      const pos: Position = { blockIndex: 0, path: [], offset: 2 };
      const ops: Operation[] = [
        { type: 'insert_text', path: [0, 0], offset: 5, data: 'XX' },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(2);
    });

    it('should shift offset left on delete_text before position', () => {
      const pos: Position = { blockIndex: 0, path: [], offset: 8 };
      const ops: Operation[] = [
        { type: 'delete_text', path: [0, 0], offset: 2, length: 3 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(5); // 8 - 3
    });

    it('should collapse to delete start when position is inside deletion', () => {
      const pos: Position = { blockIndex: 0, path: [], offset: 4 };
      const ops: Operation[] = [
        { type: 'delete_text', path: [0, 0], offset: 2, length: 5 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(2);
    });

    it('should not shift on delete_text in different block', () => {
      const pos: Position = { blockIndex: 1, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'delete_text', path: [0, 0], offset: 0, length: 3 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(5);
      expect(result.blockIndex).toBe(1);
    });

    it('should shift blockIndex on insert_node before', () => {
      const pos: Position = { blockIndex: 2, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'insert_node', path: [], offset: 1 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.blockIndex).toBe(3);
    });

    it('should not shift blockIndex on insert_node after', () => {
      const pos: Position = { blockIndex: 1, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'insert_node', path: [], offset: 3 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.blockIndex).toBe(1);
    });

    it('should shift blockIndex on delete_node before', () => {
      const pos: Position = { blockIndex: 3, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'delete_node', path: [], offset: 1 },
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.blockIndex).toBe(2);
    });

    it('should handle multiple operations', () => {
      const pos: Position = { blockIndex: 0, path: [], offset: 5 };
      const ops: Operation[] = [
        { type: 'insert_text', path: [0, 0], offset: 0, data: 'AB' },  // +2
        { type: 'insert_text', path: [0, 0], offset: 3, data: 'C' },   // +1 (before 7)
      ];
      const result = sm.mapPositionThrough(pos, ops);
      expect(result.offset).toBe(8); // 5 + 2 + 1
    });
  });

  describe('mapThrough', () => {
    const sm = new SelectionManager();

    it('should map both anchor and focus', () => {
      const selection = {
        anchor: { blockIndex: 0, path: [], offset: 2 },
        focus: { blockIndex: 0, path: [], offset: 5 },
      };
      const ops: Operation[] = [
        { type: 'insert_text', path: [0, 0], offset: 0, data: 'X' },
      ];
      const result = sm.mapThrough(selection, ops);
      expect(result.anchor.offset).toBe(3);
      expect(result.focus.offset).toBe(6);
    });
  });
});
