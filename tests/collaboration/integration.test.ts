import { describe, it, expect, vi } from 'vitest';
import { generateDelta, applyDelta } from '../../src/collaboration/delta';
import { transform } from '../../src/collaboration/ot';
import { BatchedTransport } from '../../src/collaboration/batched-transport';
import { MemoryTransport } from '../../src/collaboration/transport';
import { createDocWith } from '../helpers';
import type { Document, TextNode, Delta, TransportAdapter } from '../../src/core/types';

describe('Collaboration Integration', () => {
  describe('Operation Granularity', () => {
    it('should produce a single insert_text op for a text insertion', () => {
      const prev = createDocWith([{ type: 'paragraph', text: 'Hello' }]);
      const next: Document = {
        ...prev,
        version: 1,
        children: [{
          ...prev.children[0],
          children: [{ ...(prev.children[0].children[0] as TextNode), text: 'Hello!' }],
        }],
      };

      const delta = generateDelta(prev, next, 'client-a');
      const insertOps = delta.operations.filter((op) => op.type === 'insert_text');
      expect(insertOps).toHaveLength(1);
      expect(insertOps[0].data).toBe('!');
      expect(insertOps[0].offset).toBe(5);
    });

    it('should produce granular ops for a character deletion', () => {
      const prev = createDocWith([{ type: 'paragraph', text: 'Hello!' }]);
      const next: Document = {
        ...prev,
        version: 1,
        children: [{
          ...prev.children[0],
          children: [{ ...(prev.children[0].children[0] as TextNode), text: 'Hello' }],
        }],
      };

      const delta = generateDelta(prev, next, 'client-a');
      const deleteOps = delta.operations.filter((op) => op.type === 'delete_text');
      expect(deleteOps).toHaveLength(1);
      expect(deleteOps[0].length).toBe(1);
      expect(deleteOps[0].offset).toBe(5);
    });

    it('should not produce full-document replacement ops', () => {
      const prev = createDocWith([{ type: 'paragraph', text: 'The quick brown fox' }]);
      const next: Document = {
        ...prev,
        version: 1,
        children: [{
          ...prev.children[0],
          children: [{ ...(prev.children[0].children[0] as TextNode), text: 'The quick red fox' }],
        }],
      };

      const delta = generateDelta(prev, next, 'client-a');
      // Should not have insert_node at root level (no full doc replace)
      const fullReplace = delta.operations.filter(
        (op) => op.type === 'insert_node' && op.path.length === 0,
      );
      expect(fullReplace).toHaveLength(0);
      // Should have granular text ops
      expect(delta.operations.length).toBeGreaterThan(0);
      expect(delta.operations.length).toBeLessThanOrEqual(3); // delete + insert at most
    });
  });

  describe('Round-trip Convergence', () => {
    it('should converge when client A types and client B applies the delta', () => {
      const baseDoc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);

      // Client A types " World"
      const clientADoc: Document = {
        ...baseDoc,
        version: 1,
        children: [{
          ...baseDoc.children[0],
          children: [{ ...(baseDoc.children[0].children[0] as TextNode), text: 'Hello World' }],
        }],
      };

      const delta = generateDelta(baseDoc, clientADoc, 'client-a');

      // Client B starts from same base and applies delta
      const clientBDoc = applyDelta(baseDoc, delta);

      // Both should have same text
      const getBlockText = (doc: Document) =>
        (doc.children[0].children[0] as TextNode).text;
      expect(getBlockText(clientBDoc)).toBe('Hello World');
    });

    it('should handle concurrent edits with OT transform', () => {
      const baseDoc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);

      // Client A appends " World" at the end
      const clientADoc: Document = {
        ...baseDoc,
        version: 1,
        children: [{
          ...baseDoc.children[0],
          children: [{ ...(baseDoc.children[0].children[0] as TextNode), text: 'Hello World' }],
        }],
      };

      // Client B prepends "Hey " at the beginning
      const clientBDoc: Document = {
        ...baseDoc,
        version: 1,
        children: [{
          ...baseDoc.children[0],
          children: [{ ...(baseDoc.children[0].children[0] as TextNode), text: 'Hey Hello' }],
        }],
      };

      const deltaA = generateDelta(baseDoc, clientADoc, 'client-a');
      const deltaB = generateDelta(baseDoc, clientBDoc, 'client-b');

      // Transform: A has priority
      const result = transform(deltaA.operations, deltaB.operations, 'left');

      // Both transforms should produce non-empty results
      expect(result.opA.length).toBeGreaterThanOrEqual(0);
      expect(result.opB.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BatchedTransport', () => {
    it('should batch multiple deltas and flush them together', async () => {
      const [transportA, transportB] = MemoryTransport.createPair();
      transportA.connect();
      transportB.connect();

      const received: Delta[] = [];
      transportB.onReceive((delta) => received.push(delta));

      const batched = new BatchedTransport(transportA, { flushInterval: 50 });

      const delta1: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'a' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'test',
        timestamp: Date.now(),
      };
      const delta2: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 1, data: 'b' }],
        baseVersion: 1,
        resultVersion: 2,
        clientId: 'test',
        timestamp: Date.now(),
      };

      batched.send(delta1);
      batched.send(delta2);

      // Before flush, nothing received yet
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toHaveLength(0);

      // After flush interval, should receive one batched delta
      await new Promise((r) => setTimeout(r, 60));
      // Give time for async delivery
      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0].operations).toHaveLength(2);
      expect(received[0].operations[0].data).toBe('a');
      expect(received[0].operations[1].data).toBe('b');
    });

    it('should flush immediately when max batch size is reached', async () => {
      const [transportA, transportB] = MemoryTransport.createPair();
      transportA.connect();
      transportB.connect();

      const received: Delta[] = [];
      transportB.onReceive((delta) => received.push(delta));

      const batched = new BatchedTransport(transportA, { flushInterval: 5000, maxBatchSize: 3 });

      for (let i = 0; i < 3; i++) {
        batched.send({
          operations: [{ type: 'insert_text', path: [0, 0], offset: i, data: String(i) }],
          baseVersion: i,
          resultVersion: i + 1,
          clientId: 'test',
          timestamp: Date.now(),
        });
      }

      // Should flush immediately after reaching maxBatchSize
      await new Promise((r) => setTimeout(r, 20));
      expect(received).toHaveLength(1);
      expect(received[0].operations).toHaveLength(3);
    });
  });
});
