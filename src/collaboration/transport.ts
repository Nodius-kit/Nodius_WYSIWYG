import type { Delta, CursorInfo, TransportAdapter } from '../core/types';

/**
 * In-memory transport for testing. Simulates a two-client setup.
 */
export class MemoryTransport implements TransportAdapter {
  private peer: MemoryTransport | null = null;
  private receiveCallback: ((delta: Delta) => void) | null = null;
  private cursorCallback: ((cursor: CursorInfo) => void) | null = null;
  private connected = false;

  /**
   * Link two transports together. Messages sent on one arrive on the other.
   */
  static createPair(): [MemoryTransport, MemoryTransport] {
    const a = new MemoryTransport();
    const b = new MemoryTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  send(delta: Delta): void {
    if (!this.connected || !this.peer) return;
    // Simulate async delivery
    const peer = this.peer;
    Promise.resolve().then(() => {
      peer.receiveCallback?.(delta);
    });
  }

  onReceive(callback: (delta: Delta) => void): void {
    this.receiveCallback = callback;
  }

  onCursorUpdate(callback: (cursor: CursorInfo) => void): void {
    this.cursorCallback = callback;
  }

  sendCursor(cursor: CursorInfo): void {
    if (!this.connected || !this.peer) return;
    const peer = this.peer;
    Promise.resolve().then(() => {
      peer.cursorCallback?.(cursor);
    });
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }
}
