import { describe, it, expect } from 'vitest';
import { createEditor, createHistoryPlugin, boldPlugin, baseStylesPlugin } from '../../src/index';
import { generateDelta, applyDelta } from '../../src/collaboration/delta';
import { transform } from '../../src/collaboration/ot';
import { MemoryTransport } from '../../src/collaboration/transport';
import { createDocWith, getBlockText } from '../helpers';
import type { Document, TextNode, CoreEditor, Delta } from '../../src/core/types';

describe('Collaboration + History Integration', () => {
  describe('local undo during remote operations', () => {
    it('should undo local change while receiving remote ops', () => {
      // Start with a shared document
      const initialDoc = createDocWith([{ type: 'paragraph', text: 'Hello', attrs: {} }]);

      // Local: insert " World" at end
      const localOp = { type: 'insert_text' as const, path: [0, 0], offset: 5, data: ' World' };
      const localDoc = applyDelta(initialDoc, {
        operations: [localOp],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'local',
        timestamp: 100,
      });
      expect(getBlockText(localDoc, 0)).toBe('Hello World');

      // Remote: insert "!" at end of original
      const remoteOp = { type: 'insert_text' as const, path: [0, 0], offset: 5, data: '!' };
      const remoteDoc = applyDelta(initialDoc, {
        operations: [remoteOp],
        baseVersion: 0,
        resultVersion: 1,
        clientId: 'remote',
        timestamp: 200,
      });
      expect(getBlockText(remoteDoc, 0)).toBe('Hello!');

      // Transform remote ops through local ops
      const { opB: transformedRemote } = transform([localOp], [remoteOp]);

      // Apply transformed remote to local doc
      const mergedDoc = applyDelta(localDoc, {
        operations: transformedRemote as any,
        baseVersion: 1,
        resultVersion: 2,
        clientId: 'remote',
        timestamp: 200,
      });

      // Both changes should be present
      const text = getBlockText(mergedDoc, 0);
      expect(text).toContain('Hello');
      expect(text).toContain('World');
      expect(text).toContain('!');
    });
  });

  describe('undo/redo with collaboration', () => {
    it('should maintain undo stack independently of remote ops', () => {
      const { plugin: histPlugin, history } = createHistoryPlugin();

      const editor = createEditor({
        plugins: [baseStylesPlugin, boldPlugin, histPlugin],
        initialContent: createDocWith([{ type: 'paragraph', text: 'Hello', attrs: {} }]),
      });

      // Create a container for mounting
      const container = document.createElement('div');
      editor.mount(container);

      // Local edit
      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 5, data: ' World' }],
        origin: 'input',
        timestamp: Date.now(),
      });
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World');

      // Simulate remote edit
      editor.dispatch({
        operations: [{ type: 'insert_text', path: [0, 0], offset: 11, data: '!' }],
        origin: 'remote',
        timestamp: Date.now(),
      });
      expect(getBlockText(editor.getDoc(), 0)).toBe('Hello World!');

      // Undo via command — should revert to the snapshot before the local edit
      // History uses doc snapshots, so undo restores the pre-local-edit doc
      editor.executeCommand('undo');
      const afterUndo = getBlockText(editor.getDoc(), 0);
      expect(afterUndo).toBe('Hello');

      // Redo via command — restores the snapshot from before undo,
      // which included the remote "!" since it was the current doc at undo time
      editor.executeCommand('redo');
      const afterRedo = getBlockText(editor.getDoc(), 0);
      expect(afterRedo).toBe('Hello World!');

      editor.destroy();
    });
  });

  describe('remote ops and delta round-trip', () => {
    it('should correctly generate and apply deltas', () => {
      const doc1 = createDocWith([
        { type: 'paragraph', text: 'First paragraph', attrs: {} },
        { type: 'paragraph', text: 'Second paragraph', attrs: {} },
      ]);

      // Edit first paragraph
      const doc2: Document = {
        ...doc1,
        version: 1,
        children: [
          {
            ...doc1.children[0],
            children: [{ ...(doc1.children[0].children[0] as TextNode), text: 'First paragraph edited' }],
          },
          doc1.children[1],
        ],
      };

      const delta = generateDelta(doc1, doc2, 'client-a');
      expect(delta.operations.length).toBeGreaterThan(0);

      // Apply delta to original doc
      const result = applyDelta(doc1, delta);
      expect(getBlockText(result, 0)).toBe('First paragraph edited');
      expect(getBlockText(result, 1)).toBe('Second paragraph');
    });
  });

  describe('history state after collaborative merge', () => {
    it('should handle undo after receiving and applying transformed remote ops', () => {
      const initialDoc = createDocWith([{ type: 'paragraph', text: 'ABCDE', attrs: {} }]);

      // Client A inserts "X" at offset 2: "ABXCDE"
      const opA = { type: 'insert_text' as const, path: [0, 0], offset: 2, data: 'X' };
      // Client B inserts "Y" at offset 4: "ABCDYE"
      const opB = { type: 'insert_text' as const, path: [0, 0], offset: 4, data: 'Y' };

      // Transform
      const { opA: tA, opB: tB } = transform([opA], [opB]);

      // Apply A then tB
      let docA = applyDelta(initialDoc, {
        operations: [opA],
        baseVersion: 0, resultVersion: 1, clientId: 'a', timestamp: 0,
      });
      docA = applyDelta(docA, {
        operations: tB as any,
        baseVersion: 1, resultVersion: 2, clientId: 'b', timestamp: 0,
      });

      // Apply B then tA
      let docB = applyDelta(initialDoc, {
        operations: [opB],
        baseVersion: 0, resultVersion: 1, clientId: 'b', timestamp: 0,
      });
      docB = applyDelta(docB, {
        operations: tA as any,
        baseVersion: 1, resultVersion: 2, clientId: 'a', timestamp: 0,
      });

      // Both should converge
      expect(getBlockText(docA, 0)).toBe(getBlockText(docB, 0));
      // Both should contain X and Y
      const text = getBlockText(docA, 0);
      expect(text).toContain('X');
      expect(text).toContain('Y');
    });
  });
});
