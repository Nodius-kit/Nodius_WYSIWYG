import type { Delta, CursorInfo, TransportAdapter } from '../core/types';
import { deltaToInstructions, instructionsToDelta } from './instruction-converter';
import type { DeltaMeta } from './instruction-converter';
import type { Instruction } from '@nodius/utils';

/**
 * Wire format used by InstructionTransport.
 * Deltas are sent as Instructions instead of raw Operations.
 */
export interface InstructionDelta {
  readonly instructions: Instruction[];
  readonly baseVersion: number;
  readonly resultVersion: number;
  readonly clientId: string;
  readonly timestamp: number;
}

/**
 * Transport decorator that converts between editor Operations and
 * @nodius/utils Instructions on the wire.
 *
 * Wraps any TransportAdapter — the inner transport sends/receives
 * InstructionDelta objects (serialized as Delta on the wire).
 */
export class InstructionTransport implements TransportAdapter {
  private inner: TransportAdapter;

  constructor(inner: TransportAdapter) {
    this.inner = inner;
  }

  send(delta: Delta): void {
    // Convert Operations → Instructions
    const { instructions, meta } = deltaToInstructions(delta);
    const wirePayload: InstructionDelta = {
      instructions,
      baseVersion: meta.baseVersion,
      resultVersion: meta.resultVersion,
      clientId: meta.clientId,
      timestamp: meta.timestamp,
    };
    // Send as a Delta on the wire (inner transport expects Delta shape)
    this.inner.send(wirePayload as unknown as Delta);
  }

  onReceive(callback: (delta: Delta) => void): void {
    this.inner.onReceive((wireDelta: Delta) => {
      // The wire delta is actually an InstructionDelta
      const wire = wireDelta as unknown as InstructionDelta;
      if (wire.instructions && Array.isArray(wire.instructions)) {
        // Convert Instructions → Operations
        const meta: DeltaMeta = {
          baseVersion: wire.baseVersion,
          resultVersion: wire.resultVersion,
          clientId: wire.clientId,
          timestamp: wire.timestamp,
        };
        const delta = instructionsToDelta(wire.instructions, meta);
        callback(delta);
      } else {
        // Fallback: pass through as-is (non-instruction delta)
        callback(wireDelta);
      }
    });
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
    this.inner.disconnect();
  }
}
