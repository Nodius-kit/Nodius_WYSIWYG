import type { Position, Operation, EditorSelection, CursorInfo } from '../core/types';

export class CursorSyncManager {
  private remoteCursors: Map<string, CursorInfo> = new Map();
  private listeners: Set<() => void> = new Set();

  updateRemoteCursor(cursor: CursorInfo): void {
    this.remoteCursors.set(cursor.clientId, cursor);
    this.notifyListeners();
  }

  removeRemoteCursor(clientId: string): void {
    this.remoteCursors.delete(clientId);
    this.notifyListeners();
  }

  getRemoteCursors(): CursorInfo[] {
    return Array.from(this.remoteCursors.values());
  }

  /**
   * Map all remote cursor positions through a set of operations.
   * Call this after applying remote operations to keep cursors in sync.
   */
  mapCursorsThroughOps(ops: readonly Operation[]): void {
    for (const [clientId, cursor] of this.remoteCursors) {
      const newPosition = mapPosition(cursor.position, ops);
      const newSelection = cursor.selection
        ? {
            anchor: mapPosition(cursor.selection.anchor, ops),
            focus: mapPosition(cursor.selection.focus, ops),
          }
        : undefined;

      this.remoteCursors.set(clientId, {
        ...cursor,
        position: newPosition,
        selection: newSelection,
      });
    }
    this.notifyListeners();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.remoteCursors.clear();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * Map a single position through a list of operations.
 */
export function mapPosition(pos: Position, ops: readonly Operation[]): Position {
  let result = pos;
  for (const op of ops) {
    result = mapPositionThroughOp(result, op);
  }
  return result;
}

function mapPositionThroughOp(pos: Position, op: Operation): Position {
  switch (op.type) {
    case 'insert_text': {
      if (op.path.length >= 1 && op.path[0] === pos.blockIndex) {
        const insertOffset = op.offset ?? 0;
        const insertedLength = typeof op.data === 'string' ? op.data.length : 0;
        if (insertOffset <= pos.offset) {
          return { ...pos, offset: pos.offset + insertedLength };
        }
      }
      return pos;
    }

    case 'delete_text': {
      if (op.path.length >= 1 && op.path[0] === pos.blockIndex) {
        const delStart = op.offset ?? 0;
        const delLength = op.length ?? 0;
        const delEnd = delStart + delLength;

        if (pos.offset <= delStart) return pos;
        if (pos.offset >= delEnd) return { ...pos, offset: pos.offset - delLength };
        return { ...pos, offset: delStart };
      }
      return pos;
    }

    case 'insert_node': {
      if (op.path.length === 0) {
        const insertAt = op.offset ?? 0;
        if (insertAt <= pos.blockIndex) {
          return { ...pos, blockIndex: pos.blockIndex + 1 };
        }
      }
      return pos;
    }

    case 'delete_node': {
      if (op.path.length === 0) {
        const delAt = op.offset ?? 0;
        if (delAt < pos.blockIndex) {
          return { ...pos, blockIndex: pos.blockIndex - 1 };
        }
        if (delAt === pos.blockIndex) {
          return { ...pos, blockIndex: Math.max(0, pos.blockIndex - 1), offset: 0 };
        }
      }
      return pos;
    }

    default:
      return pos;
  }
}
