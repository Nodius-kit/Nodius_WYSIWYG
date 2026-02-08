import { describe, it, expect, vi } from 'vitest';
import { CursorSyncManager, mapPosition } from '../../src/collaboration/cursor-sync';
import type { Operation, Position, CursorInfo } from '../../src/core/types';

describe('mapPosition', () => {
  it('should shift right on insert_text before', () => {
    const pos: Position = { blockIndex: 0, path: [], offset: 5 };
    const ops: Operation[] = [{ type: 'insert_text', path: [0, 0], offset: 2, data: 'XX' }];
    const result = mapPosition(pos, ops);
    expect(result.offset).toBe(7);
  });

  it('should shift left on delete_text before', () => {
    const pos: Position = { blockIndex: 0, path: [], offset: 8 };
    const ops: Operation[] = [{ type: 'delete_text', path: [0, 0], offset: 2, length: 3 }];
    const result = mapPosition(pos, ops);
    expect(result.offset).toBe(5);
  });

  it('should collapse to delete start when inside deletion', () => {
    const pos: Position = { blockIndex: 0, path: [], offset: 4 };
    const ops: Operation[] = [{ type: 'delete_text', path: [0, 0], offset: 2, length: 5 }];
    const result = mapPosition(pos, ops);
    expect(result.offset).toBe(2);
  });

  it('should shift blockIndex on insert_node', () => {
    const pos: Position = { blockIndex: 2, path: [], offset: 0 };
    const ops: Operation[] = [{ type: 'insert_node', path: [], offset: 1 }];
    const result = mapPosition(pos, ops);
    expect(result.blockIndex).toBe(3);
  });

  it('should shift blockIndex on delete_node before', () => {
    const pos: Position = { blockIndex: 3, path: [], offset: 0 };
    const ops: Operation[] = [{ type: 'delete_node', path: [], offset: 1 }];
    const result = mapPosition(pos, ops);
    expect(result.blockIndex).toBe(2);
  });
});

describe('CursorSyncManager', () => {
  it('should track remote cursors', () => {
    const csm = new CursorSyncManager();
    const cursor: CursorInfo = {
      clientId: 'user-1',
      displayName: 'Alice',
      color: '#ff0000',
      position: { blockIndex: 0, path: [], offset: 5 },
    };

    csm.updateRemoteCursor(cursor);
    expect(csm.getRemoteCursors()).toHaveLength(1);
    expect(csm.getRemoteCursors()[0].displayName).toBe('Alice');
  });

  it('should remove remote cursor', () => {
    const csm = new CursorSyncManager();
    csm.updateRemoteCursor({
      clientId: 'user-1', displayName: 'Alice', color: '#ff0000',
      position: { blockIndex: 0, path: [], offset: 0 },
    });
    csm.removeRemoteCursor('user-1');
    expect(csm.getRemoteCursors()).toHaveLength(0);
  });

  it('should map cursors through operations', () => {
    const csm = new CursorSyncManager();
    csm.updateRemoteCursor({
      clientId: 'user-1', displayName: 'Alice', color: '#ff0000',
      position: { blockIndex: 0, path: [], offset: 5 },
    });

    csm.mapCursorsThroughOps([
      { type: 'insert_text', path: [0, 0], offset: 0, data: 'XX' },
    ]);

    expect(csm.getRemoteCursors()[0].position.offset).toBe(7);
  });

  it('should notify listeners on change', () => {
    const csm = new CursorSyncManager();
    const listener = vi.fn();
    csm.onChange(listener);

    csm.updateRemoteCursor({
      clientId: 'user-1', displayName: 'Alice', color: '#ff0000',
      position: { blockIndex: 0, path: [], offset: 0 },
    });

    expect(listener).toHaveBeenCalledOnce();
  });

  it('should unsubscribe listener', () => {
    const csm = new CursorSyncManager();
    const listener = vi.fn();
    const unsub = csm.onChange(listener);
    unsub();

    csm.updateRemoteCursor({
      clientId: 'user-1', displayName: 'Alice', color: '#ff0000',
      position: { blockIndex: 0, path: [], offset: 0 },
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
