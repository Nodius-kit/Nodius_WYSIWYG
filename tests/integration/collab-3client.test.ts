import { describe, it, expect } from 'vitest';
import { generateDelta, applyDelta } from '../../src/collaboration/delta';
import { transform } from '../../src/collaboration/ot';
import { MemoryTransport } from '../../src/collaboration/transport';
import { createDocWith, getBlockText } from '../helpers';
import type { Document, TextNode, Operation, Delta } from '../../src/core/types';

describe('3-Client Collaboration', () => {
  describe('concurrent text inserts convergence', () => {
    it('should converge when 3 clients insert at non-overlapping positions', () => {
      // Use a server-order approach: server processes A, then B (vs A), then C (vs A+B')
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello', attrs: {} }]);

      // Client A inserts "A" at offset 0 (before "Hello")
      const opA: Operation = { type: 'insert_text', path: [0, 0], offset: 0, data: 'A' };
      // Client B inserts "B" at offset 5 (after "Hello")
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: 'B' };
      // Client C inserts "C" at offset 5 (after "Hello")
      const opC: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: 'C' };

      // Server processes A first — everyone needs A
      // Then transform B against A
      const { opA: tBvsA_forB, opB: tAvsB_forA } = transform([opB], [opA], 'left');
      // Then transform C against A
      const { opA: tCvsA_forC, opB: tAvsC_forA } = transform([opC], [opA], 'left');
      // Then transform C' against B'  (after both are transformed through A)
      const { opA: tCvsB_final, opB: tBvsC_final } = transform(tCvsA_forC, tBvsA_forB, 'left');

      // Client A: apply A, then B' (transformed through A), then C' (transformed through A+B)
      let docA = applyDelta(doc, { operations: [opA], baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: 0 });
      docA = applyDelta(docA, { operations: tBvsA_forB as any, baseVersion: 1, resultVersion: 2, clientId: 'b', timestamp: 0 });
      docA = applyDelta(docA, { operations: tCvsB_final as any, baseVersion: 2, resultVersion: 3, clientId: 'c', timestamp: 0 });

      // Client B: apply B, then A' (transformed through B), then C'' (transformed through A+B)
      let docB = applyDelta(doc, { operations: [opB], baseVersion: 0, resultVersion: 1, clientId: 'b', timestamp: 0 });
      docB = applyDelta(docB, { operations: tAvsB_forA as any, baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0 });
      docB = applyDelta(docB, { operations: tCvsB_final as any, baseVersion: 2, resultVersion: 3, clientId: 'c', timestamp: 0 });

      // Client C: apply C, then A' (transformed through C), then B'' (transformed through A+C)
      let docC = applyDelta(doc, { operations: [opC], baseVersion: 0, resultVersion: 1, clientId: 'c', timestamp: 0 });
      docC = applyDelta(docC, { operations: tAvsC_forA as any, baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0 });
      docC = applyDelta(docC, { operations: tBvsC_final as any, baseVersion: 2, resultVersion: 3, clientId: 'b', timestamp: 0 });

      const textA = getBlockText(docA, 0);
      const textB = getBlockText(docB, 0);
      const textC = getBlockText(docC, 0);

      // All should contain all inserted characters
      expect(textA).toContain('A');
      expect(textA).toContain('B');
      expect(textA).toContain('C');
      expect(textA.length).toBe(8); // "Hello" (5) + A + B + C

      // All should converge
      expect(textA).toBe(textB);
      expect(textB).toBe(textC);
    });
  });

  describe('concurrent block operations convergence', () => {
    it('should converge when 3 clients perform block ops', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'Block 0', attrs: {} },
        { type: 'paragraph', text: 'Block 1', attrs: {} },
        { type: 'paragraph', text: 'Block 2', attrs: {} },
      ]);

      // Client A: insert a new block at index 1
      const nodeData = {
        id: 'new-block',
        kind: 'element' as const,
        type: 'paragraph',
        attrs: {},
        children: [{ id: 'new-text', kind: 'text' as const, text: 'New Block A', marks: [] }],
      };
      const opA: Operation = { type: 'insert_node', path: [], offset: 1, data: nodeData };

      // Client B: edit text in block 2
      const opB: Operation = { type: 'insert_text', path: [2, 0], offset: 7, data: ' edited' };

      // Transform A vs B
      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // Client A: apply A then tB
      let docA = applyDelta(doc, { operations: [opA], baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: 0 });
      docA = applyDelta(docA, { operations: tB as any, baseVersion: 1, resultVersion: 2, clientId: 'b', timestamp: 0 });

      // Client B: apply B then tA
      let docB = applyDelta(doc, { operations: [opB], baseVersion: 0, resultVersion: 1, clientId: 'b', timestamp: 0 });
      docB = applyDelta(docB, { operations: tA as any, baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0 });

      // Both should have 4 blocks and the edit should be in the right block
      expect(docA.children.length).toBe(4);
      expect(docB.children.length).toBe(4);

      // Block 0 should be "Block 0" in both
      expect(getBlockText(docA, 0)).toBe('Block 0');
      expect(getBlockText(docB, 0)).toBe('Block 0');
    });

    it('should handle concurrent deletes on different blocks', () => {
      const doc = createDocWith([
        { type: 'paragraph', text: 'Block 0', attrs: {} },
        { type: 'paragraph', text: 'Block 1', attrs: {} },
        { type: 'paragraph', text: 'Block 2', attrs: {} },
        { type: 'paragraph', text: 'Block 3', attrs: {} },
      ]);

      // Client A: delete block 1
      const opA: Operation = { type: 'delete_node', path: [], offset: 1 };
      // Client B: delete block 3
      const opB: Operation = { type: 'delete_node', path: [], offset: 3 };

      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // Client A: apply A then tB
      let docA = applyDelta(doc, { operations: [opA], baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: 0 });
      docA = applyDelta(docA, { operations: tB as any, baseVersion: 1, resultVersion: 2, clientId: 'b', timestamp: 0 });

      // Client B: apply B then tA
      let docB = applyDelta(doc, { operations: [opB], baseVersion: 0, resultVersion: 1, clientId: 'b', timestamp: 0 });
      docB = applyDelta(docB, { operations: tA as any, baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0 });

      // Both should have 2 blocks: Block 0 and Block 2
      expect(docA.children.length).toBe(2);
      expect(docB.children.length).toBe(2);
      expect(getBlockText(docA, 0)).toBe('Block 0');
      expect(getBlockText(docA, 1)).toBe('Block 2');
      expect(getBlockText(docB, 0)).toBe('Block 0');
      expect(getBlockText(docB, 1)).toBe('Block 2');
    });
  });

  describe('MemoryTransport with 3 clients (triangle)', () => {
    it('should sync text edits between 3 clients via transports', async () => {
      // Create a triangle of transports: A↔B, B↔C, A↔C
      const [abA, abB] = MemoryTransport.createPair();
      const [bcB, bcC] = MemoryTransport.createPair();
      const [acA, acC] = MemoryTransport.createPair();

      abA.connect(); abB.connect();
      bcB.connect(); bcC.connect();
      acA.connect(); acC.connect();

      const doc = createDocWith([{ type: 'paragraph', text: 'Start', attrs: {} }]);

      // Client A sends an edit to B and C
      const deltaA: Delta = {
        operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' A' }],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'a',
        timestamp: 100,
      };

      const receivedByB: Delta[] = [];
      const receivedByC: Delta[] = [];

      abB.onReceive((d) => receivedByB.push(d));
      acC.onReceive((d) => receivedByC.push(d));

      // A sends to B and C
      abA.send(deltaA);
      acA.send(deltaA);

      await Promise.resolve();

      expect(receivedByB).toHaveLength(1);
      expect(receivedByB[0].operations[0].type).toBe('insert_text');
      expect(receivedByC).toHaveLength(1);
      expect(receivedByC[0].operations[0].type).toBe('insert_text');

      // Apply to both
      const docB = applyDelta(doc, receivedByB[0]);
      const docC = applyDelta(doc, receivedByC[0]);

      expect(getBlockText(docB, 0)).toBe('Start A');
      expect(getBlockText(docC, 0)).toBe('Start A');
    });
  });

  describe('concurrent edits with type changes', () => {
    it('should handle concurrent text insert + type change', () => {
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello', attrs: {} }]);

      // Client A: change block type to heading
      const opA: Operation = { type: 'set_node_type', path: [0], nodeType: 'heading' };
      // Client B: insert text
      const opB: Operation = { type: 'insert_text', path: [0, 0], offset: 5, data: ' World' };

      // These ops are independent in the current OT (no transform needed)
      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // Apply A then tB
      let docA = applyDelta(doc, { operations: [opA], baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: 0 });
      docA = applyDelta(docA, { operations: tB as any, baseVersion: 1, resultVersion: 2, clientId: 'b', timestamp: 0 });

      // Apply B then tA
      let docB = applyDelta(doc, { operations: [opB], baseVersion: 0, resultVersion: 1, clientId: 'b', timestamp: 0 });
      docB = applyDelta(docB, { operations: tA as any, baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0 });

      // Both should have heading type with "Hello World"
      expect(docA.children[0].type).toBe('heading');
      expect(getBlockText(docA, 0)).toBe('Hello World');
      expect(docB.children[0].type).toBe('heading');
      expect(getBlockText(docB, 0)).toBe('Hello World');
    });
  });
});
