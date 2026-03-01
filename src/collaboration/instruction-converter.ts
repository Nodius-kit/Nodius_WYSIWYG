import { OpType, type Instruction } from '@nodius/utils';
import type { Operation, Delta, Mark } from '../core/types';

// ─── Meta interface for Delta ↔ Instructions batch conversion ─

export interface DeltaMeta {
  readonly baseVersion: number;
  readonly resultVersion: number;
  readonly clientId: string;
  readonly timestamp: number;
}

// ─── Path helper ────────────────────────────────────────────────

/**
 * Convert editor numeric path to InstructionBuilder string path.
 * `[0, 2]` + `'text'` → `['children', '0', 'children', '2', 'text']`
 * `[]` + `'children'` → `['children']`
 */
function docPath(path: readonly number[], leaf?: string): string[] {
  const parts: string[] = [];
  for (const idx of path) {
    parts.push('children', String(idx));
  }
  if (leaf) {
    parts.push(leaf);
  }
  return parts;
}

/**
 * Parse an InstructionBuilder string path back to editor numeric path + optional leaf.
 * `['children', '0', 'children', '2', 'text']` → `{ path: [0, 2], leaf: 'text' }`
 * `['children']` → `{ path: [], leaf: 'children' }`
 */
function parsePath(p: string[]): { path: number[]; leaf: string | undefined } {
  const path: number[] = [];
  let i = 0;
  while (i < p.length - 1 && p[i] === 'children') {
    path.push(Number(p[i + 1]));
    i += 2;
  }
  const leaf = i < p.length ? p[i] : undefined;
  return { path, leaf };
}

// ─── Operation → Instruction ────────────────────────────────────

export function operationToInstruction(op: Operation): Instruction {
  switch (op.type) {
    case 'insert_text':
      return {
        o: OpType.STR_INS,
        p: docPath(op.path, 'text'),
        i: op.offset ?? 0,
        v: op.data as string,
      };

    case 'delete_text':
      return {
        o: OpType.STR_REM,
        p: docPath(op.path, 'text'),
        i: op.offset ?? 0,
        l: op.length ?? 0,
      };

    case 'insert_node':
      return {
        o: OpType.ARR_INS,
        p: docPath(op.path, 'children'),
        i: op.offset ?? 0,
        v: op.data,
      };

    case 'delete_node':
      return {
        o: OpType.ARR_REM_IDX,
        p: docPath(op.path, 'children'),
        i: op.offset ?? 0,
      };

    case 'set_node_type':
      return {
        o: OpType.SET,
        p: docPath(op.path, 'type'),
        v: op.nodeType,
      };

    case 'update_attrs':
      return {
        o: OpType.DICT_MERGE,
        p: docPath(op.path, 'attrs'),
        v: op.attrs,
      };

    case 'move_node':
      return {
        o: OpType.ARR_MOVE,
        p: docPath(op.path, 'children'),
        f: op.offset ?? 0,
        t: (op.targetPath && op.targetPath.length > 0) ? op.targetPath[op.targetPath.length - 1] : (op.offset ?? 0),
      };

    // Mark ops — encoded as SET on a virtual __mark path
    case 'add_mark':
      return {
        o: OpType.SET,
        p: ['__mark'],
        v: {
          op: 'add_mark',
          path: [...op.path],
          offset: op.offset,
          length: op.length,
          mark: op.mark,
        },
      };

    case 'remove_mark':
      return {
        o: OpType.SET,
        p: ['__mark'],
        v: {
          op: 'remove_mark',
          path: [...op.path],
          offset: op.offset,
          length: op.length,
          mark: op.mark,
        },
      };

    // Structural ops — encoded as SET on a virtual __structural path
    case 'wrap_node':
      return {
        o: OpType.SET,
        p: ['__structural'],
        v: serializeOp(op),
      };

    case 'lift_node':
      return {
        o: OpType.SET,
        p: ['__structural'],
        v: serializeOp(op),
      };

    case 'split_node':
      return {
        o: OpType.SET,
        p: ['__structural'],
        v: serializeOp(op),
      };

    case 'merge_nodes':
      return {
        o: OpType.SET,
        p: ['__structural'],
        v: serializeOp(op),
      };

    default:
      // Fallback for any unknown operation type
      return {
        o: OpType.SET,
        p: ['__unknown'],
        v: serializeOp(op),
      };
  }
}

// ─── Instruction → Operation ────────────────────────────────────

export function instructionToOperation(inst: Instruction): Operation {
  const p = inst.p ?? [];

  // Virtual paths for mark/structural/unknown ops
  if (p[0] === '__mark' || p[0] === '__structural' || p[0] === '__unknown') {
    return deserializeOp(inst.v);
  }

  switch (inst.o) {
    case OpType.STR_INS: {
      const { path } = parsePath(p);
      // Remove the 'text' leaf — the path itself goes to the text node
      return {
        type: 'insert_text',
        path,
        offset: inst.i ?? 0,
        data: inst.v as string,
      };
    }

    case OpType.STR_REM: {
      const { path } = parsePath(p);
      return {
        type: 'delete_text',
        path,
        offset: inst.i ?? 0,
        length: inst.l ?? 0,
      };
    }

    case OpType.ARR_INS: {
      const { path } = parsePath(p);
      return {
        type: 'insert_node',
        path,
        offset: inst.i ?? 0,
        data: inst.v,
      };
    }

    case OpType.ARR_REM_IDX: {
      const { path } = parsePath(p);
      return {
        type: 'delete_node',
        path,
        offset: inst.i ?? 0,
      };
    }

    case OpType.SET: {
      const { path, leaf } = parsePath(p);
      if (leaf === 'type') {
        return {
          type: 'set_node_type',
          path,
          nodeType: inst.v as string,
        };
      }
      // Shouldn't reach here for normal ops (mark/structural handled above)
      return deserializeOp(inst.v);
    }

    case OpType.DICT_MERGE: {
      const { path } = parsePath(p);
      return {
        type: 'update_attrs',
        path,
        attrs: inst.v as Record<string, unknown>,
      };
    }

    case OpType.ARR_MOVE: {
      const { path } = parsePath(p);
      return {
        type: 'move_node',
        path,
        offset: inst.f ?? 0,
        targetPath: [...path, inst.t ?? 0],
      };
    }

    default:
      // Fallback: try to deserialize from value
      return deserializeOp(inst.v);
  }
}

// ─── Batch conversion ───────────────────────────────────────────

export function deltaToInstructions(delta: Delta): { instructions: Instruction[]; meta: DeltaMeta } {
  const instructions = delta.operations.map(operationToInstruction);
  const meta: DeltaMeta = {
    baseVersion: delta.baseVersion,
    resultVersion: delta.resultVersion,
    clientId: delta.clientId,
    timestamp: delta.timestamp,
  };
  return { instructions, meta };
}

export function instructionsToDelta(instructions: Instruction[], meta: DeltaMeta): Delta {
  const operations = instructions.map(instructionToOperation);
  return {
    operations,
    baseVersion: meta.baseVersion,
    resultVersion: meta.resultVersion,
    clientId: meta.clientId,
    timestamp: meta.timestamp,
  };
}

// ─── Serialization helpers ──────────────────────────────────────

function serializeOp(op: Operation): Record<string, unknown> {
  const result: Record<string, unknown> = { op: op.type };
  if (op.path.length > 0) result.path = [...op.path];
  else result.path = [];
  if (op.offset !== undefined) result.offset = op.offset;
  if (op.length !== undefined) result.length = op.length;
  if (op.data !== undefined) result.data = op.data;
  if (op.mark !== undefined) result.mark = op.mark;
  if (op.nodeType !== undefined) result.nodeType = op.nodeType;
  if (op.attrs !== undefined) result.attrs = op.attrs;
  if (op.targetPath !== undefined) result.targetPath = [...op.targetPath];
  return result;
}

function deserializeOp(v: unknown): Operation {
  const obj = v as Record<string, unknown>;
  const result: Record<string, unknown> = {
    type: obj.op as string,
    path: (obj.path as number[]) ?? [],
  };
  if (obj.offset !== undefined) result.offset = obj.offset;
  if (obj.length !== undefined) result.length = obj.length;
  if (obj.data !== undefined) result.data = obj.data;
  if (obj.mark !== undefined) result.mark = obj.mark;
  if (obj.nodeType !== undefined) result.nodeType = obj.nodeType;
  if (obj.attrs !== undefined) result.attrs = obj.attrs;
  if (obj.targetPath !== undefined) result.targetPath = obj.targetPath;
  return result as unknown as Operation;
}
