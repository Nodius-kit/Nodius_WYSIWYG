/**
 * Example: WebSocket-based collaboration backend integration
 *
 * This example shows how to implement a TransportAdapter using WebSocket
 * and wire it up with the Nodius editor for real-time collaboration.
 *
 * This file is NOT part of the library bundle — it's a usage example.
 */

import type { Delta, CursorInfo, TransportAdapter } from '../src/core/types';
import { BatchedTransport } from '../src/collaboration/batched-transport';

// ─── WebSocket Transport ────────────────────────────────────────

class WebSocketTransport implements TransportAdapter {
  private ws: WebSocket | null = null;
  private receiveCallback: ((delta: Delta) => void) | null = null;
  private cursorCallback: ((cursor: CursorInfo) => void) | null = null;

  constructor(private url: string) {}

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'delta':
          this.receiveCallback?.(msg.delta as Delta);
          break;
        case 'cursor':
          this.cursorCallback?.(msg.cursor as CursorInfo);
          break;
      }
    };

    this.ws.onclose = () => {
      console.log('[collab] WebSocket disconnected');
    };

    this.ws.onerror = (err) => {
      console.error('[collab] WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(delta: Delta): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'delta', delta }));
    }
  }

  onReceive(callback: (delta: Delta) => void): void {
    this.receiveCallback = callback;
  }

  sendCursor(cursor: CursorInfo): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cursor', cursor }));
    }
  }

  onCursorUpdate(callback: (cursor: CursorInfo) => void): void {
    this.cursorCallback = callback;
  }
}

// ─── Usage ──────────────────────────────────────────────────────

/**
 * Usage with the Nodius editor:
 *
 * ```typescript
 * import { createEditor, createCollabPlugin } from '@nodius/editor';
 *
 * const transport = new WebSocketTransport('ws://localhost:3000/collab/room-123');
 * const batched = new BatchedTransport(transport, { flushInterval: 200 });
 *
 * const { plugin: collabPlugin } = createCollabPlugin({
 *   transport: batched,
 *   clientId: 'user-abc',
 *   displayName: 'Alice',
 *   color: '#3b82f6',
 * });
 *
 * const editor = createEditor({
 *   plugins: [boldPlugin, italicPlugin, collabPlugin, toolbarPlugin],
 * });
 *
 * // Mount the editor
 * editor.mount(document.getElementById('editor')!);
 *
 * // Connect transport after mount
 * batched.connect();
 * ```
 */

// ─── Minimal Server Example (Node.js) ──────────────────────────

/**
 * Server-side example using `ws` package:
 *
 * ```typescript
 * import { WebSocketServer } from 'ws';
 *
 * const wss = new WebSocketServer({ port: 3000 });
 * const rooms = new Map<string, Set<WebSocket>>();
 *
 * wss.on('connection', (ws, req) => {
 *   const roomId = new URL(req.url!, `http://${req.headers.host}`).pathname;
 *   if (!rooms.has(roomId)) rooms.set(roomId, new Set());
 *   const room = rooms.get(roomId)!;
 *   room.add(ws);
 *
 *   ws.on('message', (data) => {
 *     // Broadcast to all other clients in the room
 *     for (const client of room) {
 *       if (client !== ws && client.readyState === WebSocket.OPEN) {
 *         client.send(data.toString());
 *       }
 *     }
 *   });
 *
 *   ws.on('close', () => {
 *     room.delete(ws);
 *     if (room.size === 0) rooms.delete(roomId);
 *   });
 * });
 * ```
 */

export { WebSocketTransport };
