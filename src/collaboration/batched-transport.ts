import type { Delta, CursorInfo, TransportAdapter, Operation } from '../core/types';

export interface BatchedTransportOptions {
  flushInterval?: number;  // default 300ms
  maxBatchSize?: number;   // default 50 ops
}

export class BatchedTransport implements TransportAdapter {
  private inner: TransportAdapter;
  private flushInterval: number;
  private maxBatchSize: number;
  private pendingOps: Operation[] = [];
  private pendingMeta: { baseVersion: number; clientId: string; timestamp: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(inner: TransportAdapter, options?: BatchedTransportOptions) {
    this.inner = inner;
    this.flushInterval = options?.flushInterval ?? 300;
    this.maxBatchSize = options?.maxBatchSize ?? 50;
  }

  send(delta: Delta): void {
    // Accumulate operations
    if (!this.pendingMeta) {
      this.pendingMeta = {
        baseVersion: delta.baseVersion,
        clientId: delta.clientId,
        timestamp: delta.timestamp,
      };
    }
    this.pendingOps.push(...delta.operations);

    // Force flush if max batch size reached
    if (this.pendingOps.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Start timer if not already running
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.flushInterval);
    }
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.pendingOps.length === 0 || !this.pendingMeta) return;

    const batchedDelta: Delta = {
      operations: [...this.pendingOps],
      baseVersion: this.pendingMeta.baseVersion,
      resultVersion: this.pendingMeta.baseVersion + 1,
      clientId: this.pendingMeta.clientId,
      timestamp: Date.now(),
    };

    this.pendingOps = [];
    this.pendingMeta = null;

    this.inner.send(batchedDelta);
  }

  onReceive(callback: (delta: Delta) => void): void {
    this.inner.onReceive(callback);
  }

  onCursorUpdate(callback: (cursor: CursorInfo) => void): void {
    this.inner.onCursorUpdate(callback);
  }

  sendCursor(cursor: CursorInfo): void {
    this.inner.sendCursor(cursor);
  }

  connect(): void {
    this.inner.connect();
  }

  disconnect(): void {
    // Flush pending ops before disconnecting
    this.flush();
    this.inner.disconnect();
  }
}
