import { describe, it, expect, vi } from 'vitest';
import { InstructionTransport } from '../../src/collaboration/instruction-transport';
import { MemoryTransport } from '../../src/collaboration/transport';
import { BatchedTransport } from '../../src/collaboration/batched-transport';
import type { Delta } from '../../src/core/types';

describe('InstructionTransport', () => {
  describe('send/receive round-trip', () => {
    it('should convert operations to instructions and back', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);

      instrA.connect();
      instrB.connect();

      const received: Delta[] = [];
      instrB.onReceive((delta) => received.push(delta));

      const delta: Delta = {
        operations: [
          { type: 'insert_text', path: [0, 0], offset: 5, data: ' world' },
          { type: 'delete_text', path: [1, 0], offset: 0, length: 3 },
        ],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'alice',
        timestamp: 1000,
      };

      instrA.send(delta);

      // MemoryTransport is microtask-async
      await Promise.resolve();

      expect(received).toHaveLength(1);
      expect(received[0].operations).toHaveLength(2);
      expect(received[0].operations[0].type).toBe('insert_text');
      expect(received[0].operations[0].data).toBe(' world');
      expect(received[0].operations[0].offset).toBe(5);
      expect(received[0].operations[1].type).toBe('delete_text');
      expect(received[0].operations[1].length).toBe(3);
      expect(received[0].baseVersion).toBe(0);
      expect(received[0].resultVersion).toBe(1);
      expect(received[0].clientId).toBe('alice');
    });

    it('should handle empty operations', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);

      instrA.connect();
      instrB.connect();

      const received: Delta[] = [];
      instrB.onReceive((delta) => received.push(delta));

      const delta: Delta = {
        operations: [],
        baseVersion: 0,
        resultVersion: 0,
        clientId: 'bob',
        timestamp: 0,
      };

      instrA.send(delta);
      await Promise.resolve();

      expect(received).toHaveLength(1);
      expect(received[0].operations).toHaveLength(0);
    });
  });

  describe('bidirectional communication', () => {
    it('should work in both directions', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);

      instrA.connect();
      instrB.connect();

      const receivedByA: Delta[] = [];
      const receivedByB: Delta[] = [];

      instrA.onReceive((delta) => receivedByA.push(delta));
      instrB.onReceive((delta) => receivedByB.push(delta));

      const deltaA: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'A' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'alice',
        timestamp: 100,
      };

      const deltaB: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'B' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'bob',
        timestamp: 200,
      };

      instrA.send(deltaA);
      instrB.send(deltaB);
      await Promise.resolve();

      expect(receivedByB).toHaveLength(1);
      expect(receivedByB[0].operations[0].data).toBe('A');
      expect(receivedByA).toHaveLength(1);
      expect(receivedByA[0].operations[0].data).toBe('B');
    });
  });

  describe('with BatchedTransport', () => {
    it('should work when wrapped with BatchedTransport', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);
      const batchedA = new BatchedTransport(instrA, { flushInterval: 50, maxBatchSize: 10 });
      const batchedB = new BatchedTransport(instrB, { flushInterval: 50, maxBatchSize: 10 });

      batchedA.connect();
      batchedB.connect();

      const received: Delta[] = [];
      batchedB.onReceive((delta) => received.push(delta));

      const delta: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'alice',
        timestamp: 1000,
      };

      batchedA.send(delta);

      // Wait for flush interval + microtask
      await new Promise((r) => setTimeout(r, 100));

      expect(received.length).toBeGreaterThanOrEqual(1);
      // The batched transport merges ops — check the text was received
      const allOps = received.flatMap((d) => d.operations);
      const insertOps = allOps.filter((op) => op.type === 'insert_text');
      expect(insertOps.length).toBeGreaterThanOrEqual(1);

      batchedA.disconnect();
      batchedB.disconnect();
    });
  });

  describe('cursor delegation', () => {
    it('should delegate cursor methods to inner transport', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);

      instrA.connect();
      instrB.connect();

      const cursors: any[] = [];
      instrB.onCursorUpdate((cursor) => cursors.push(cursor));

      const cursor = {
        clientId: 'alice',
        position: { blockIndex: 0, offset: 5 },
        userName: 'Alice',
        color: '#ff0000',
      };

      instrA.sendCursor(cursor);
      await Promise.resolve();

      expect(cursors).toHaveLength(1);
      expect(cursors[0].clientId).toBe('alice');
    });
  });

  describe('connect/disconnect delegation', () => {
    it('should not send when disconnected', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);

      // Not connected — no connect() call
      const received: Delta[] = [];
      instrB.onReceive((delta) => received.push(delta));

      instrA.send({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'X' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'test',
        timestamp: 0,
      });

      await Promise.resolve();
      expect(received).toHaveLength(0);
    });
  });

  describe('all 13 op types through transport', () => {
    it('should round-trip all operation types', async () => {
      const [rawA, rawB] = MemoryTransport.createPair();
      const instrA = new InstructionTransport(rawA);
      const instrB = new InstructionTransport(rawB);
      instrA.connect();
      instrB.connect();

      const received: Delta[] = [];
      instrB.onReceive((delta) => received.push(delta));

      const delta: Delta = {
        operations: [
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
        ],
        baseVersion: 10,
        resultVersion: 11,
        clientId: 'all-ops',
        timestamp: 5000,
      };

      instrA.send(delta);
      await Promise.resolve();

      expect(received).toHaveLength(1);
      expect(received[0].operations).toHaveLength(13);
      for (let i = 0; i < 13; i++) {
        expect(received[0].operations[i].type).toBe(delta.operations[i].type);
      }
    });
  });
});
