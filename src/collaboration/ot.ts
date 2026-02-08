import type { Operation } from '../core/types';

export interface TransformResult {
  readonly opA: readonly Operation[];
  readonly opB: readonly Operation[];
}

/**
 * Transform two sets of concurrent operations so they can be applied in either order
 * and produce the same final state.
 *
 * Priority: 'left' means opA wins ties, 'right' means opB wins ties.
 */
export function transform(
  opsA: readonly Operation[],
  opsB: readonly Operation[],
  priority: 'left' | 'right' = 'left',
): TransformResult {
  let transformedA = [...opsA];
  let transformedB = [...opsB];

  // Transform each pair
  for (let i = 0; i < transformedA.length; i++) {
    for (let j = 0; j < transformedB.length; j++) {
      const [newA, newB] = transformPair(transformedA[i], transformedB[j], priority);
      transformedA[i] = newA;
      transformedB[j] = newB;
    }
  }

  return { opA: transformedA, opB: transformedB };
}

function transformPair(
  opA: Operation,
  opB: Operation,
  priority: 'left' | 'right',
): [Operation, Operation] {
  // Same block text operations
  if (isTextOp(opA) && isTextOp(opB) && samePath(opA.path, opB.path)) {
    return transformTextOps(opA, opB, priority);
  }

  // Same-level node operations
  if (isNodeOp(opA) && isNodeOp(opB) && samePath(opA.path, opB.path)) {
    return transformNodeOps(opA, opB, priority);
  }

  // Text op vs node op: adjust text op path if node op changes block indices
  if (isTextOp(opA) && isNodeOp(opB)) {
    return transformTextVsNode(opA, opB);
  }
  if (isNodeOp(opA) && isTextOp(opB)) {
    const [newB, newA] = transformTextVsNode(opB, opA);
    return [newA, newB];
  }

  // Mark operations are independent unless they affect the same range
  if (isMarkOp(opA) && isMarkOp(opB)) {
    return transformMarkOps(opA, opB);
  }

  // Default: operations are independent, no transformation needed
  return [opA, opB];
}

// ─── Text Operation Transforms ──────────────────────────────

function transformTextOps(
  opA: Operation,
  opB: Operation,
  priority: 'left' | 'right',
): [Operation, Operation] {
  const offsetA = opA.offset ?? 0;
  const offsetB = opB.offset ?? 0;

  // insert_text vs insert_text
  if (opA.type === 'insert_text' && opB.type === 'insert_text') {
    const lenA = typeof opA.data === 'string' ? opA.data.length : 0;
    const lenB = typeof opB.data === 'string' ? opB.data.length : 0;

    if (offsetA < offsetB || (offsetA === offsetB && priority === 'left')) {
      return [opA, { ...opB, offset: offsetB + lenA }];
    } else {
      return [{ ...opA, offset: offsetA + lenB }, opB];
    }
  }

  // insert_text vs delete_text
  if (opA.type === 'insert_text' && opB.type === 'delete_text') {
    const delStart = offsetB;
    const delLen = opB.length ?? 0;
    const delEnd = delStart + delLen;

    if (offsetA <= delStart) {
      const lenA = typeof opA.data === 'string' ? opA.data.length : 0;
      return [opA, { ...opB, offset: delStart + lenA }];
    } else if (offsetA >= delEnd) {
      return [{ ...opA, offset: offsetA - delLen }, opB];
    } else {
      // Insert inside deletion range
      return [{ ...opA, offset: delStart }, opB];
    }
  }

  // delete_text vs insert_text
  if (opA.type === 'delete_text' && opB.type === 'insert_text') {
    const [newB, newA] = transformTextOps(opB, opA, priority === 'left' ? 'right' : 'left');
    return [newA, newB];
  }

  // delete_text vs delete_text
  if (opA.type === 'delete_text' && opB.type === 'delete_text') {
    const startA = offsetA;
    const lenA = opA.length ?? 0;
    const endA = startA + lenA;
    const startB = offsetB;
    const lenB = opB.length ?? 0;
    const endB = startB + lenB;

    // No overlap
    if (endA <= startB) {
      return [opA, { ...opB, offset: startB - lenA }];
    }
    if (endB <= startA) {
      return [{ ...opA, offset: startA - lenB }, opB];
    }

    // Overlap
    const overlapStart = Math.max(startA, startB);
    const overlapEnd = Math.min(endA, endB);
    const overlapLen = overlapEnd - overlapStart;

    const newLenA = lenA - overlapLen;
    const newLenB = lenB - overlapLen;

    const newStartA = startA < startB ? startA : startA - (overlapLen > 0 ? Math.min(overlapLen, startA - startB > 0 ? startA - startB : 0) : 0);
    const newStartB = startB < startA ? startB : startB - (overlapLen > 0 ? Math.min(overlapLen, startB - startA > 0 ? startB - startA : 0) : 0);

    return [
      newLenA > 0 ? { ...opA, offset: Math.min(startA, startB), length: newLenA } : { ...opA, offset: Math.min(startA, startB), length: 0 },
      newLenB > 0 ? { ...opB, offset: Math.min(startA, startB), length: newLenB } : { ...opB, offset: Math.min(startA, startB), length: 0 },
    ];
  }

  return [opA, opB];
}

// ─── Node Operation Transforms ──────────────────────────────

function transformNodeOps(
  opA: Operation,
  opB: Operation,
  priority: 'left' | 'right',
): [Operation, Operation] {
  const offsetA = opA.offset ?? 0;
  const offsetB = opB.offset ?? 0;

  // insert_node vs insert_node
  if (opA.type === 'insert_node' && opB.type === 'insert_node') {
    if (offsetA < offsetB || (offsetA === offsetB && priority === 'left')) {
      return [opA, { ...opB, offset: offsetB + 1 }];
    } else {
      return [{ ...opA, offset: offsetA + 1 }, opB];
    }
  }

  // delete_node vs delete_node
  if (opA.type === 'delete_node' && opB.type === 'delete_node') {
    if (offsetA === offsetB) {
      // Both deleting same node — one becomes no-op
      return [
        { ...opA, type: 'delete_node', offset: -1 } as Operation, // no-op sentinel
        { ...opB, type: 'delete_node', offset: -1 } as Operation,
      ];
    }
    if (offsetA < offsetB) {
      return [opA, { ...opB, offset: offsetB - 1 }];
    }
    return [{ ...opA, offset: offsetA - 1 }, opB];
  }

  // insert_node vs delete_node
  if (opA.type === 'insert_node' && opB.type === 'delete_node') {
    if (offsetA <= offsetB) {
      return [opA, { ...opB, offset: offsetB + 1 }];
    }
    return [{ ...opA, offset: offsetA - 1 }, opB];
  }

  // delete_node vs insert_node
  if (opA.type === 'delete_node' && opB.type === 'insert_node') {
    if (offsetB <= offsetA) {
      return [{ ...opA, offset: offsetA + 1 }, opB];
    }
    return [opA, { ...opB, offset: offsetB - 1 }];
  }

  return [opA, opB];
}

// ─── Text vs Node Transforms ────────────────────────────────

function transformTextVsNode(
  textOp: Operation,
  nodeOp: Operation,
): [Operation, Operation] {
  // If a node is inserted/deleted at document level, adjust text op's block path
  if (nodeOp.path.length === 0 && textOp.path.length > 0) {
    const blockIndex = textOp.path[0];
    const nodeOffset = nodeOp.offset ?? 0;

    if (nodeOp.type === 'insert_node') {
      if (nodeOffset <= blockIndex) {
        return [{ ...textOp, path: [blockIndex + 1, ...textOp.path.slice(1)] }, nodeOp];
      }
    } else if (nodeOp.type === 'delete_node') {
      if (nodeOffset < blockIndex) {
        return [{ ...textOp, path: [blockIndex - 1, ...textOp.path.slice(1)] }, nodeOp];
      } else if (nodeOffset === blockIndex) {
        // Text op's block was deleted — make text op a no-op
        return [{ ...textOp, path: [-1], data: '' } as Operation, nodeOp];
      }
    }
  }
  return [textOp, nodeOp];
}

// ─── Mark Operation Transforms ──────────────────────────────

function transformMarkOps(
  opA: Operation,
  opB: Operation,
): [Operation, Operation] {
  // Mark operations are typically independent — both can apply
  // Only conflict if they're on the exact same range with the same mark type
  // In that case, both still apply (idempotent)
  return [opA, opB];
}

// ─── Helpers ─────────────────────────────────────────────────

function isTextOp(op: Operation): boolean {
  return op.type === 'insert_text' || op.type === 'delete_text';
}

function isNodeOp(op: Operation): boolean {
  return op.type === 'insert_node' || op.type === 'delete_node';
}

function isMarkOp(op: Operation): boolean {
  return op.type === 'add_mark' || op.type === 'remove_mark';
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
