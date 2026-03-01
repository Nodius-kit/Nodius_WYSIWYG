import { describe, it, expect } from 'vitest';
import {
  operationToInstruction,
  instructionToOperation,
  deltaToInstructions,
  instructionsToDelta,
} from '../../src/collaboration/instruction-converter';
import { OpType } from '@nodius/utils';
import type { Operation, Delta } from '../../src/core/types';

describe('Instruction Converter', () => {
  describe('insert_text round-trip', () => {
    it('should convert insert_text to STR_INS and back', () => {
      const op: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: 'hello' };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.STR_INS);
      expect(inst.p).toEqual(['children', '0', 'children', '0', 'text']);
      expect(inst.i).toBe(5);
      expect(inst.v).toBe('hello');

      const back = instructionToOperation(inst);
      expect(back.type).toBe('insert_text');
      expect(back.path).toEqual([0, 0]);
      expect(back.offset).toBe(5);
      expect(back.data).toBe('hello');
    });

    it('should handle insert at offset 0', () => {
      const op: Operation = { type: 'insert_text', path: [2, 0], offset: 0, data: 'A' };
      const inst = operationToInstruction(op);
      const back = instructionToOperation(inst);
      expect(back).toEqual(op);
    });
  });

  describe('delete_text round-trip', () => {
    it('should convert delete_text to STR_REM and back', () => {
      const op: Operation = { type: 'delete_text', path: [1, 0], offset: 3, length: 4 };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.STR_REM);
      expect(inst.p).toEqual(['children', '1', 'children', '0', 'text']);
      expect(inst.i).toBe(3);
      expect(inst.l).toBe(4);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('delete_text');
      expect(back.path).toEqual([1, 0]);
      expect(back.offset).toBe(3);
      expect(back.length).toBe(4);
    });
  });

  describe('insert_node round-trip', () => {
    it('should convert insert_node to ARR_INS and back', () => {
      const nodeData = {
        id: 'node-1',
        kind: 'element' as const,
        type: 'paragraph',
        attrs: {},
        children: [{ id: 'text-1', kind: 'text' as const, text: 'Hello', marks: [] }],
      };
      const op: Operation = { type: 'insert_node', path: [], offset: 2, data: nodeData };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.ARR_INS);
      expect(inst.p).toEqual(['children']);
      expect(inst.i).toBe(2);
      expect(inst.v).toEqual(nodeData);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('insert_node');
      expect(back.path).toEqual([]);
      expect(back.offset).toBe(2);
      expect(back.data).toEqual(nodeData);
    });
  });

  describe('delete_node round-trip', () => {
    it('should convert delete_node to ARR_REM_IDX and back', () => {
      const op: Operation = { type: 'delete_node', path: [], offset: 3 };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.ARR_REM_IDX);
      expect(inst.p).toEqual(['children']);
      expect(inst.i).toBe(3);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('delete_node');
      expect(back.path).toEqual([]);
      expect(back.offset).toBe(3);
    });
  });

  describe('set_node_type round-trip', () => {
    it('should convert set_node_type to SET and back', () => {
      const op: Operation = { type: 'set_node_type', path: [1], nodeType: 'heading' };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.SET);
      expect(inst.p).toEqual(['children', '1', 'type']);
      expect(inst.v).toBe('heading');

      const back = instructionToOperation(inst);
      expect(back.type).toBe('set_node_type');
      expect(back.path).toEqual([1]);
      expect(back.nodeType).toBe('heading');
    });
  });

  describe('update_attrs round-trip', () => {
    it('should convert update_attrs to DICT_MERGE and back', () => {
      const attrs = { textAlign: 'center', level: 2 };
      const op: Operation = { type: 'update_attrs', path: [0], attrs };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.DICT_MERGE);
      expect(inst.p).toEqual(['children', '0', 'attrs']);
      expect(inst.v).toEqual(attrs);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('update_attrs');
      expect(back.path).toEqual([0]);
      expect(back.attrs).toEqual(attrs);
    });
  });

  describe('move_node round-trip', () => {
    it('should convert move_node to ARR_MOVE and back', () => {
      const op: Operation = { type: 'move_node', path: [], offset: 1, targetPath: [3] };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.ARR_MOVE);
      expect(inst.p).toEqual(['children']);
      expect(inst.f).toBe(1);
      expect(inst.t).toBe(3);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('move_node');
      expect(back.path).toEqual([]);
      expect(back.offset).toBe(1);
      expect(back.targetPath).toEqual([3]);
    });
  });

  describe('add_mark round-trip', () => {
    it('should convert add_mark via SET on __mark and back', () => {
      const mark = { type: 'bold' };
      const op: Operation = { type: 'add_mark', path: [0], offset: 2, length: 5, mark };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.SET);
      expect(inst.p).toEqual(['__mark']);
      expect(inst.v.op).toBe('add_mark');
      expect(inst.v.offset).toBe(2);
      expect(inst.v.length).toBe(5);
      expect(inst.v.mark).toEqual(mark);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('add_mark');
      expect(back.path).toEqual([0]);
      expect(back.offset).toBe(2);
      expect(back.length).toBe(5);
      expect(back.mark).toEqual(mark);
    });

    it('should handle mark with attrs', () => {
      const mark = { type: 'link', attrs: { href: 'https://example.com' } };
      const op: Operation = { type: 'add_mark', path: [1], offset: 0, length: 10, mark };
      const inst = operationToInstruction(op);
      const back = instructionToOperation(inst);
      expect(back.mark).toEqual(mark);
    });
  });

  describe('remove_mark round-trip', () => {
    it('should convert remove_mark via SET on __mark and back', () => {
      const mark = { type: 'italic' };
      const op: Operation = { type: 'remove_mark', path: [0], offset: 0, length: 3, mark };
      const inst = operationToInstruction(op);

      expect(inst.o).toBe(OpType.SET);
      expect(inst.p).toEqual(['__mark']);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('remove_mark');
      expect(back.path).toEqual([0]);
      expect(back.offset).toBe(0);
      expect(back.length).toBe(3);
      expect(back.mark).toEqual(mark);
    });
  });

  describe('structural ops round-trip', () => {
    it('should convert wrap_node and back', () => {
      const op: Operation = {
        type: 'wrap_node', path: [0], offset: 0,
        nodeType: 'list_item', data: { id: 'new-1', kind: 'element', type: 'list_item', attrs: {}, children: [] },
      };
      const inst = operationToInstruction(op);
      expect(inst.o).toBe(OpType.SET);
      expect(inst.p).toEqual(['__structural']);

      const back = instructionToOperation(inst);
      expect(back.type).toBe('wrap_node');
      expect(back.path).toEqual([0]);
    });

    it('should convert lift_node and back', () => {
      const op: Operation = { type: 'lift_node', path: [0, 0], offset: 0 };
      const inst = operationToInstruction(op);
      const back = instructionToOperation(inst);
      expect(back.type).toBe('lift_node');
      expect(back.path).toEqual([0, 0]);
    });

    it('should convert split_node and back', () => {
      const op: Operation = { type: 'split_node', path: [0], offset: 5 };
      const inst = operationToInstruction(op);
      const back = instructionToOperation(inst);
      expect(back.type).toBe('split_node');
      expect(back.path).toEqual([0]);
      expect(back.offset).toBe(5);
    });

    it('should convert merge_nodes and back', () => {
      const op: Operation = { type: 'merge_nodes', path: [1], offset: 0 };
      const inst = operationToInstruction(op);
      const back = instructionToOperation(inst);
      expect(back.type).toBe('merge_nodes');
      expect(back.path).toEqual([1]);
    });
  });

  describe('deltaToInstructions / instructionsToDelta', () => {
    it('should round-trip a delta with multiple operations', () => {
      const delta: Delta = {
        operations: [
          { type: 'insert_text', path: [0, 0], offset: 0, data: 'Hi' },
          { type: 'delete_text', path: [1, 0], offset: 3, length: 2 },
          { type: 'set_node_type', path: [2], nodeType: 'heading' },
        ],
        baseVersion: 5,
        resultVersion: 6,
        clientId: 'client-a',
        timestamp: 1000,
      };

      const { instructions, meta } = deltaToInstructions(delta);
      expect(instructions).toHaveLength(3);
      expect(meta.baseVersion).toBe(5);
      expect(meta.resultVersion).toBe(6);
      expect(meta.clientId).toBe('client-a');

      const back = instructionsToDelta(instructions, meta);
      expect(back.operations).toHaveLength(3);
      expect(back.operations[0].type).toBe('insert_text');
      expect(back.operations[1].type).toBe('delete_text');
      expect(back.operations[2].type).toBe('set_node_type');
      expect(back.baseVersion).toBe(5);
      expect(back.resultVersion).toBe(6);
      expect(back.clientId).toBe('client-a');
    });

    it('should handle empty delta', () => {
      const delta: Delta = {
        operations: [],
        baseVersion: 0,
        resultVersion: 0,
        clientId: 'c',
        timestamp: 0,
      };

      const { instructions, meta } = deltaToInstructions(delta);
      expect(instructions).toHaveLength(0);

      const back = instructionsToDelta(instructions, meta);
      expect(back.operations).toHaveLength(0);
    });

    it('should handle delta with all 13 operation types', () => {
      const ops: Operation[] = [
        { type: 'insert_text', path: [0, 0], offset: 0, data: 'X' },
        { type: 'delete_text', path: [0, 0], offset: 0, length: 1 },
        { type: 'insert_node', path: [], offset: 0, data: { id: 'n', kind: 'element', type: 'paragraph', attrs: {}, children: [] } },
        { type: 'delete_node', path: [], offset: 0 },
        { type: 'set_node_type', path: [0], nodeType: 'heading' },
        { type: 'update_attrs', path: [0], attrs: { level: 1 } },
        { type: 'add_mark', path: [0], offset: 0, length: 1, mark: { type: 'bold' } },
        { type: 'remove_mark', path: [0], offset: 0, length: 1, mark: { type: 'bold' } },
        { type: 'wrap_node', path: [0], offset: 0, nodeType: 'list_item' },
        { type: 'lift_node', path: [0, 0], offset: 0 },
        { type: 'split_node', path: [0], offset: 3 },
        { type: 'merge_nodes', path: [1], offset: 0 },
        { type: 'move_node', path: [], offset: 0, targetPath: [2] },
      ];

      const delta: Delta = {
        operations: ops,
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'test',
        timestamp: 100,
      };

      const { instructions } = deltaToInstructions(delta);
      expect(instructions).toHaveLength(13);

      const back = instructionsToDelta(instructions, { baseVersion: 0, resultVersion: 1, clientId: 'test', timestamp: 100 });
      expect(back.operations).toHaveLength(13);
      for (let i = 0; i < ops.length; i++) {
        expect(back.operations[i].type).toBe(ops[i].type);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty path', () => {
      const op: Operation = { type: 'insert_node', path: [], offset: 0, data: {} };
      const inst = operationToInstruction(op);
      expect(inst.p).toEqual(['children']);
      const back = instructionToOperation(inst);
      expect(back.path).toEqual([]);
    });

    it('should handle deeply nested path', () => {
      const op: Operation = { type: 'insert_text', path: [0, 1, 2], offset: 0, data: 'X' };
      const inst = operationToInstruction(op);
      expect(inst.p).toEqual(['children', '0', 'children', '1', 'children', '2', 'text']);
      const back = instructionToOperation(inst);
      expect(back.path).toEqual([0, 1, 2]);
    });
  });
});
