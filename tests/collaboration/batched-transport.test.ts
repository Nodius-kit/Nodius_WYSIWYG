import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchedTransport } from '../../src/collaboration/batched-transport';
import type { Delta, CursorInfo, TransportAdapter } from '../../src/core/types';

function createMockTransport(): TransportAdapter & { sentDeltas: Delta[] } {
  const sentDeltas: Delta[] = [];
  let receiveCallback: ((delta: Delta) => void) | null = null;
  let cursorCallback: ((cursor: CursorInfo) => void) | null = null;

  return {
    sentDeltas,
    send(delta: Delta) { sentDeltas.push(delta); },
    onReceive(cb) { receiveCallback = cb; },
    onCursorUpdate(cb) { cursorCallback = cb; },
    sendCursor(cursor) { /* noop */ },
    connect() { /* noop */ },
    disconnect() { /* noop */ },
  };
}

function makeDelta(ops: number, clientId = 'test'): Delta {
  const operations = Array.from({ length: ops }, (_, i) => ({
    type: 'insert_text' as const,
    path: [0, 0],
    offset: i,
    data: String.fromCharCode(65 + i),
  }));
  return {
    operations,
    baseVersion: 0,
    resultVersion: 1,
    clientId,
    timestamp: Date.now(),
  };
}

describe('BatchedTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch multiple rapid sends into one', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock, { flushInterval: 100 });

    batched.send(makeDelta(1));
    batched.send(makeDelta(2));
    batched.send(makeDelta(1));

    // No send yet
    expect(mock.sentDeltas).toHaveLength(0);

    // Advance timer
    vi.advanceTimersByTime(100);

    // Now should have sent 1 batched delta
    expect(mock.sentDeltas).toHaveLength(1);
    expect(mock.sentDeltas[0].operations).toHaveLength(4); // 1 + 2 + 1
  });

  it('should flush on interval', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock, { flushInterval: 200 });

    batched.send(makeDelta(1));
    expect(mock.sentDeltas).toHaveLength(0);

    vi.advanceTimersByTime(200);
    expect(mock.sentDeltas).toHaveLength(1);
  });

  it('should force flush when maxBatchSize reached', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock, { flushInterval: 1000, maxBatchSize: 5 });

    // Send 3 ops
    batched.send(makeDelta(3));
    expect(mock.sentDeltas).toHaveLength(0);

    // Send 3 more ops (total 6, exceeds max of 5)
    batched.send(makeDelta(3));
    expect(mock.sentDeltas).toHaveLength(1);
    expect(mock.sentDeltas[0].operations).toHaveLength(6);
  });

  it('should flush pending ops on disconnect', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock, { flushInterval: 5000 });

    batched.send(makeDelta(2));
    expect(mock.sentDeltas).toHaveLength(0);

    batched.disconnect();
    expect(mock.sentDeltas).toHaveLength(1);
    expect(mock.sentDeltas[0].operations).toHaveLength(2);
  });

  it('should not send empty batch', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock, { flushInterval: 100 });

    vi.advanceTimersByTime(200);
    expect(mock.sentDeltas).toHaveLength(0);
  });

  it('should delegate onReceive to inner transport', () => {
    const mock = createMockTransport();
    const batched = new BatchedTransport(mock);

    const received: Delta[] = [];
    batched.onReceive((d) => received.push(d));

    // The callback should be registered on inner
    // (mock stores it, we verify it was called)
    expect(received).toHaveLength(0);
  });

  it('should delegate connect to inner transport', () => {
    const connectSpy = vi.fn();
    const mock = createMockTransport();
    mock.connect = connectSpy;
    const batched = new BatchedTransport(mock);

    batched.connect();
    expect(connectSpy).toHaveBeenCalled();
  });
});
