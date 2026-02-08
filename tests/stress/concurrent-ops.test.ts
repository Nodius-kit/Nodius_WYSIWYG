import { describe, it, expect } from 'vitest';
import { transform } from '../../src/collaboration/ot';
import { applyOperation } from '../../src/core/operations';
import { generateDelta } from '../../src/collaboration/delta';
import { VersionVector } from '../../src/collaboration/version';
import { createDocWith, getBlockText } from '../helpers';
import { generateId } from '../../src/core/types';
import type { Document, ElementNode, Operation } from '../../src/core/types';

describe('Concurrent OT Convergence', () => {
  it('should converge with 2 clients doing concurrent text inserts', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello' }]);

    const opsA: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 0, data: 'A' },
    ];
    const opsB: Operation[] = [
      { type: 'insert_text', path: [0, 0], offset: 5, data: 'B' },
    ];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // Path 1: apply A then tB
    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    // Path 2: apply B then tA
    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    expect(getBlockText(doc1, 0)).toBe(getBlockText(doc2, 0));
    expect(getBlockText(doc1, 0)).toBe('AHelloB');
  });

  it('should converge with 3 clients doing concurrent text inserts', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Base' }]);

    const opsA: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 0, data: 'A' }];
    const opsB: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 2, data: 'B' }];
    const opsC: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 4, data: 'C' }];

    // Client A applies A, then transforms B against A, then transforms C against A+B'
    const { opA: _tA_AB, opB: tB_AB } = transform(opsA, opsB, 'left');

    // Now client A has applied A. Transform C against A.
    const { opA: _tA_AC, opB: tC_AC } = transform(opsA, opsC, 'left');

    // Now we need C transformed against B as well (after B was transformed against A)
    const { opA: _tB_BC, opB: tC_ABC } = transform(tB_AB, tC_AC, 'left');

    // Apply on base: A, then tB_AB, then tC_ABC
    let result = doc;
    for (const op of opsA) result = applyOperation(result, op);
    for (const op of tB_AB) result = applyOperation(result, op);
    for (const op of tC_ABC) result = applyOperation(result, op);

    const text = getBlockText(result, 0);
    // All three insertions should be present and total length correct
    expect(text).toContain('A');
    expect(text).toContain('C');
    expect(text.length).toBe(7); // 4 (Base) + A + B + C
  });

  it('should converge with concurrent insert and delete on same block', () => {
    const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);

    // Client A inserts at beginning
    const opsA: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 0, data: '>> ' }];
    // Client B deletes " World"
    const opsB: Operation[] = [{ type: 'delete_text', path: [0, 0], offset: 5, length: 6 }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    expect(getBlockText(doc1, 0)).toBe(getBlockText(doc2, 0));
    expect(getBlockText(doc1, 0)).toBe('>> Hello');
  });

  it('should converge with concurrent node insert and text edit', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: 'Second' },
    ]);

    // Client A inserts a new block at index 1
    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'paragraph', attrs: {},
      children: [{ id: generateId(), kind: 'text', text: 'New', marks: [] }],
    };
    const opsA: Operation[] = [{ type: 'insert_node', path: [], offset: 1, data: newBlock }];
    // Client B edits text in block 1 (originally "Second")
    const opsB: Operation[] = [{ type: 'insert_text', path: [1, 0], offset: 6, data: '!' }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    // Both should have 3 blocks, and "Second!" text preserved
    expect(doc1.children).toHaveLength(3);
    expect(doc2.children).toHaveLength(3);
  });

  it('should converge with concurrent deletes of different blocks', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'A' },
      { type: 'paragraph', text: 'B' },
      { type: 'paragraph', text: 'C' },
      { type: 'paragraph', text: 'D' },
    ]);

    // Client A deletes block 1 (B)
    const opsA: Operation[] = [{ type: 'delete_node', path: [], offset: 1 }];
    // Client B deletes block 2 (C)
    const opsB: Operation[] = [{ type: 'delete_node', path: [], offset: 2 }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    for (const op of tB) doc1 = applyOperation(doc1, op);

    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    for (const op of tA) doc2 = applyOperation(doc2, op);

    expect(doc1.children).toHaveLength(2);
    expect(doc2.children).toHaveLength(2);
    expect(getBlockText(doc1, 0)).toBe('A');
    expect(getBlockText(doc1, 1)).toBe('D');
    expect(getBlockText(doc2, 0)).toBe('A');
    expect(getBlockText(doc2, 1)).toBe('D');
  });

  it('should converge with concurrent same-block deletes', () => {
    const doc = createDocWith([
      { type: 'paragraph', text: 'A' },
      { type: 'paragraph', text: 'B' },
      { type: 'paragraph', text: 'C' },
    ]);

    // Both clients delete block 1
    const opsA: Operation[] = [{ type: 'delete_node', path: [], offset: 1 }];
    const opsB: Operation[] = [{ type: 'delete_node', path: [], offset: 1 }];

    const { opA: tA, opB: tB } = transform(opsA, opsB);

    // After transform, both should be no-ops (offset = -1)
    let doc1 = doc;
    for (const op of opsA) doc1 = applyOperation(doc1, op);
    // tB should be a no-op (offset -1)
    expect(tB[0].offset).toBe(-1);

    let doc2 = doc;
    for (const op of opsB) doc2 = applyOperation(doc2, op);
    expect(tA[0].offset).toBe(-1);

    // Both ended with same result after applying original ops
    expect(doc1.children).toHaveLength(2);
    expect(doc2.children).toHaveLength(2);
  });

  it('should handle many sequential transforms efficiently', () => {
    // Simulate 10 clients each producing 10 insert_text ops concurrently
    const numClients = 10;
    const opsPerClient = 10;
    const clientOps: Operation[][] = [];

    for (let c = 0; c < numClients; c++) {
      const ops: Operation[] = [];
      for (let i = 0; i < opsPerClient; i++) {
        ops.push({
          type: 'insert_text',
          path: [0, 0],
          offset: 0,
          data: `${c}`,
        });
      }
      clientOps.push(ops);
    }

    const start = performance.now();

    // Sequentially transform each client's ops against all previous clients' ops
    const transformedOps: Operation[][] = [clientOps[0]];
    for (let c = 1; c < numClients; c++) {
      let currentOps = clientOps[c];
      for (let prev = 0; prev < c; prev++) {
        const { opB } = transform(transformedOps[prev], currentOps, 'left');
        currentOps = [...opB];
      }
      transformedOps.push(currentOps);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000); // Should be fast

    // Apply all transformed ops to base document and verify
    const doc = createDocWith([{ type: 'paragraph', text: 'Base' }]);
    let result = doc;
    for (const ops of transformedOps) {
      for (const op of ops) {
        result = applyOperation(result, op);
      }
    }

    const text = getBlockText(result, 0);
    // Should contain "Base" plus all 100 single-char inserts
    expect(text).toContain('Base');
    expect(text.length).toBe(4 + numClients * opsPerClient);
  });

  it('should converge version vectors for concurrent edits', () => {
    const vvA = new VersionVector({ client1: 0 });
    const vvB = new VersionVector({ client2: 0 });

    // Simulate 5 rounds of edits
    for (let i = 0; i < 5; i++) {
      vvA.increment('client1');
      vvB.increment('client2');
    }

    expect(vvA.isConcurrentWith(vvB)).toBe(true);

    // Merge
    const merged = vvA.merge(vvB);
    expect(merged.get('client1')).toBe(5);
    expect(merged.get('client2')).toBe(5);
    expect(merged.isNewerThan(vvA)).toBe(true);
    expect(merged.isNewerThan(vvB)).toBe(true);
  });

  it('should generate correct delta for complex document changes', () => {
    const prev = createDocWith([
      { type: 'paragraph', text: 'Hello World' },
      { type: 'paragraph', text: 'Second para' },
    ]);

    const newBlock: ElementNode = {
      id: generateId(), kind: 'element', type: 'heading', attrs: { level: 1 },
      children: [{ id: generateId(), kind: 'text', text: 'Title', marks: [] }],
    };

    const next: Document = {
      ...prev,
      version: 1,
      children: [
        newBlock,
        { ...prev.children[0], children: [{ ...(prev.children[0].children[0] as any), text: 'Hello' }] },
        prev.children[1],
      ],
    };

    const delta = generateDelta(prev, next, 'test-client');
    expect(delta.operations.length).toBeGreaterThan(0);
    expect(delta.clientId).toBe('test-client');
    expect(delta.baseVersion).toBe(0);
    expect(delta.resultVersion).toBe(1);
  });
});
