import { describe, it, expect } from 'vitest';
import { transform } from '../../src/collaboration/ot';
import { applyOperation } from '../../src/core/operations';
import type { Operation } from '../../src/core/types';
import { createDocWith, getBlockText, getMarksAt } from '../helpers';

describe('OT Mark vs Text Transforms', () => {
  describe('add_mark vs insert_text', () => {
    it('should shift mark right when text is inserted before mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 5, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' };

      const { opA: tMark, opB: tText } = transform([markOp], [textOp]);

      // Mark should shift right by 2
      expect(tMark[0].offset).toBe(7); // 5 + 2
      expect(tMark[0].length).toBe(3); // unchanged
      // Text op unchanged
      expect(tText[0].offset).toBe(2);
    });

    it('should expand mark when text is inserted inside mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 5, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 4, data: 'XYZ' };

      const { opA: tMark } = transform([markOp], [textOp]);

      // Mark should expand
      expect(tMark[0].offset).toBe(2); // unchanged
      expect(tMark[0].length).toBe(8); // 5 + 3
    });

    it('should not change mark when text is inserted after mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 10, data: 'X' };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(3);
    });

    it('should shift mark when text is inserted at mark start', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 3, length: 4, mark: { type: 'italic' } };
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 3, data: 'AB' };

      const { opA: tMark } = transform([markOp], [textOp]);

      // Insert at mark start → shift mark right
      expect(tMark[0].offset).toBe(5); // 3 + 2
      expect(tMark[0].length).toBe(4);
    });
  });

  describe('add_mark vs delete_text', () => {
    it('should shift mark left when text is deleted before mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 8, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 2, length: 3 };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(5); // 8 - 3
      expect(tMark[0].length).toBe(3);
    });

    it('should not change mark when text is deleted after mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 10, length: 2 };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(3);
    });

    it('should shrink mark when text is deleted inside mark range', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 8, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 5, length: 2 };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(6); // 8 - 2
    });

    it('should shrink mark to zero when delete covers entire mark', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 3, length: 4, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 2, length: 8 };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(0);
    });

    it('should adjust when delete overlaps start of mark', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 5, length: 6, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 3, length: 4 };
      // Delete: [3, 7), Mark: [5, 11)
      // Overlap at start: 7 - 5 = 2

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(3); // shifted to delete start
      expect(tMark[0].length).toBe(4); // 6 - 2
    });

    it('should adjust when delete overlaps end of mark', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 5, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 5, length: 4 };
      // Delete: [5, 9), Mark: [2, 7)
      // Overlap at end: 7 - 5 = 2

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(3); // 5 - 2
    });
  });

  describe('remove_mark vs insert_text', () => {
    it('should shift remove_mark when text is inserted before', () => {
      const markOp: Operation = { type: 'remove_mark', path: [0], offset: 4, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 1, data: 'ABC' };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(7); // 4 + 3
      expect(tMark[0].length).toBe(3);
    });
  });

  describe('remove_mark vs delete_text', () => {
    it('should shrink remove_mark when text is deleted inside range', () => {
      const markOp: Operation = { type: 'remove_mark', path: [0], offset: 2, length: 6, mark: { type: 'italic' } };
      const textOp: Operation = { type: 'delete_text', path: [0, 0], offset: 3, length: 2 };

      const { opA: tMark } = transform([markOp], [textOp]);

      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(4); // 6 - 2
    });
  });

  describe('text op vs mark op (reversed)', () => {
    it('should adjust mark when text op is opA and mark is opB', () => {
      const textOp: Operation = { type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' };
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 5, length: 3, mark: { type: 'bold' } };

      const { opB: tMark } = transform([textOp], [markOp]);

      // Mark should shift right by 2
      expect(tMark[0].offset).toBe(7);
      expect(tMark[0].length).toBe(3);
    });
  });

  describe('different blocks', () => {
    it('should not transform mark and text on different blocks', () => {
      const markOp: Operation = { type: 'add_mark', path: [0], offset: 2, length: 3, mark: { type: 'bold' } };
      const textOp: Operation = { type: 'insert_text', path: [1, 0], offset: 0, data: 'X' };

      const { opA: tMark, opB: tText } = transform([markOp], [textOp]);

      // Should remain unchanged
      expect(tMark[0].offset).toBe(2);
      expect(tMark[0].length).toBe(3);
      expect(tText[0].offset).toBe(0);
    });
  });

  describe('convergence with marks', () => {
    it('should converge when mark and text insert are concurrent', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World', attrs: {} }]);

      // Client A adds bold to "World" (offset 6, length 5)
      const opA: Operation = { type: 'add_mark', path: [0], offset: 6, length: 5, mark: { type: 'bold' } };
      // Client B inserts "XY" at offset 3 (inside "Hello")
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 3, data: 'XY' };

      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // After B inserts "XY" at 3: "HelXYlo World" → "World" is now at offset 8
      // tA should have mark at offset 8, length 5
      expect(tA[0].offset).toBe(8);
      expect(tA[0].length).toBe(5);
    });
  });
});
