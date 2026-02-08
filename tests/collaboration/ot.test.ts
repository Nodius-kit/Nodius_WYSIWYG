import { describe, it, expect } from 'vitest';
import { transform } from '../../src/collaboration/ot';
import { applyOperation } from '../../src/core/operations';
import type { Operation, Document } from '../../src/core/types';
import { createDocWith, getBlockText } from '../helpers';

describe('OT Transform', () => {
  describe('insert_text vs insert_text', () => {
    it('should adjust offsets when A inserts before B', () => {
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' };
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: 'YY' };

      const { opA: tA, opB: tB } = transform([opA], [opB]);
      // A inserts at 2, so B's offset should shift by 2
      expect(tB[0].offset).toBe(7); // 5 + 2
      expect(tA[0].offset).toBe(2); // unchanged
    });

    it('should handle same offset with priority', () => {
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 3, data: 'A' };
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 3, data: 'B' };

      const { opA: tA, opB: tB } = transform([opA], [opB], 'left');
      expect(tA[0].offset).toBe(3); // A wins, stays
      expect(tB[0].offset).toBe(4); // B shifts right

      const { opA: tA2, opB: tB2 } = transform([opA], [opB], 'right');
      expect(tA2[0].offset).toBe(4); // A shifts
      expect(tB2[0].offset).toBe(3); // B wins
    });

    it('should produce convergent results', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 0, data: 'A' };
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: 'B' };

      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // Path 1: apply A then tB
      const path1 = applyOperation(applyOperation(doc, opA), tB[0]);
      // Path 2: apply B then tA
      const path2 = applyOperation(applyOperation(doc, opB), tA[0]);

      expect(getBlockText(path1, 0)).toBe(getBlockText(path2, 0));
    });
  });

  describe('insert_text vs delete_text', () => {
    it('should adjust insert when delete is before', () => {
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 8, data: 'X' };
      const opB: Operation = { type: 'delete_text', path: [0, 0], offset: 2, length: 3 };

      const { opA: tA } = transform([opA], [opB]);
      expect(tA[0].offset).toBe(5); // 8 - 3
    });

    it('should adjust delete when insert is before', () => {
      const opA: Operation = { type: 'delete_text', path: [0, 0], offset: 5, length: 3 };
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' };

      const { opA: tA } = transform([opA], [opB]);
      expect(tA[0].offset).toBe(7); // 5 + 2
    });
  });

  describe('delete_text vs delete_text', () => {
    it('should handle non-overlapping deletes', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'ABCDEFGHIJ' }]);
      const opA: Operation = { type: 'delete_text', path: [0, 0], offset: 0, length: 2 }; // delete AB
      const opB: Operation = { type: 'delete_text', path: [0, 0], offset: 5, length: 2 }; // delete FG

      const { opA: tA, opB: tB } = transform([opA], [opB]);

      const path1 = applyOperation(applyOperation(doc, opA), tB[0]);
      const path2 = applyOperation(applyOperation(doc, opB), tA[0]);

      expect(getBlockText(path1, 0)).toBe(getBlockText(path2, 0));
      expect(getBlockText(path1, 0)).toBe('CDEHIJ');
    });
  });

  describe('insert_node vs insert_node', () => {
    it('should adjust offsets', () => {
      const opA: Operation = { type: 'insert_node', path: [], offset: 1, data: {} as any };
      const opB: Operation = { type: 'insert_node', path: [], offset: 3, data: {} as any };

      const { opB: tB } = transform([opA], [opB]);
      expect(tB[0].offset).toBe(4); // 3 + 1
    });
  });

  describe('delete_node vs delete_node', () => {
    it('should adjust offset when deleting different nodes', () => {
      const opA: Operation = { type: 'delete_node', path: [], offset: 1 };
      const opB: Operation = { type: 'delete_node', path: [], offset: 3 };

      const { opB: tB } = transform([opA], [opB]);
      expect(tB[0].offset).toBe(2); // 3 - 1
    });

    it('should make both no-ops when deleting same node', () => {
      const opA: Operation = { type: 'delete_node', path: [], offset: 2 };
      const opB: Operation = { type: 'delete_node', path: [], offset: 2 };

      const { opA: tA, opB: tB } = transform([opA], [opB]);
      expect(tA[0].offset).toBe(-1); // no-op
      expect(tB[0].offset).toBe(-1); // no-op
    });
  });

  describe('text op vs node op', () => {
    it('should adjust text op block index on node insert before', () => {
      const textOp: Operation = { type: 'insert_text', path: [2, 0], offset: 0, data: 'X' };
      const nodeOp: Operation = { type: 'insert_node', path: [], offset: 1, data: {} as any };

      const { opA: tA } = transform([textOp], [nodeOp]);
      expect(tA[0].path[0]).toBe(3); // 2 + 1
    });

    it('should adjust text op block index on node delete before', () => {
      const textOp: Operation = { type: 'insert_text', path: [3, 0], offset: 0, data: 'X' };
      const nodeOp: Operation = { type: 'delete_node', path: [], offset: 1 };

      const { opA: tA } = transform([textOp], [nodeOp]);
      expect(tA[0].path[0]).toBe(2); // 3 - 1
    });
  });

  describe('convergence property', () => {
    it('should converge with concurrent text inserts at different positions', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: ' Beautiful' };
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 11, data: '!' };

      const { opA: tA, opB: tB } = transform([opA], [opB]);

      const docA = applyOperation(doc, opA);
      const docAB = applyOperation(docA, tB[0]);

      const docB = applyOperation(doc, opB);
      const docBA = applyOperation(docB, tA[0]);

      expect(getBlockText(docAB, 0)).toBe(getBlockText(docBA, 0));
    });
  });
});
