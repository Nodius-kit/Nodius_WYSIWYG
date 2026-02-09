import { describe, it, expect, beforeEach } from 'vitest';
import { createEditor } from '../../src/core/editor';
import { createBoldPlugin } from '../../src/plugins/bold';
import { createHistoryPlugin } from '../../src/core/history';
import { applyOperation } from '../../src/core/operations';
import { createDocWith, getBlockText } from '../helpers';
import type { Document, Operation } from '../../src/core/types';

describe('Rapid Typing Simulation', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  });

  it('should handle 200 rapid character insertions without data loss', () => {
    let doc = createDocWith([{ type: 'paragraph', text: '' }]);

    const chars = 'The quick brown fox jumps over the lazy dog. ';
    const fullText = chars.repeat(5); // ~225 chars

    const start = performance.now();
    for (let i = 0; i < fullText.length; i++) {
      doc = applyOperation(doc, {
        type: 'insert_text',
        path: [0, 0],
        offset: i,
        data: fullText[i],
      });
    }
    const elapsed = performance.now() - start;

    expect(getBlockText(doc, 0)).toBe(fullText);
    expect(elapsed).toBeLessThan(2000); // Should be well under 2s
  });

  it('should handle rapid insert + delete cycles', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Start' }]);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      // Type a character
      doc = applyOperation(doc, {
        type: 'insert_text', path: [0, 0],
        offset: getBlockText(doc, 0).length, data: 'x',
      });
      // Then backspace it
      doc = applyOperation(doc, {
        type: 'delete_text', path: [0, 0],
        offset: getBlockText(doc, 0).length - 1, length: 1,
      });
    }
    const elapsed = performance.now() - start;

    expect(getBlockText(doc, 0)).toBe('Start');
    expect(elapsed).toBeLessThan(1000);
  });

  it('should handle rapid multi-block typing', () => {
    let doc = createDocWith([
      { type: 'paragraph', text: '' },
      { type: 'paragraph', text: '' },
      { type: 'paragraph', text: '' },
    ]);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const blockIdx = i % 3;
      doc = applyOperation(doc, {
        type: 'insert_text', path: [blockIdx, 0],
        offset: getBlockText(doc, blockIdx).length,
        data: String.fromCharCode(65 + (i % 26)),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    // Each block should have ~33 chars
    const total = getBlockText(doc, 0).length + getBlockText(doc, 1).length + getBlockText(doc, 2).length;
    expect(total).toBe(100);
  });

  it('should handle rapid typing with history recording', () => {
    const { plugin: historyPlugin } = createHistoryPlugin();
    const editor = createEditor({
      plugins: [historyPlugin],
      initialContent: createDocWith([{ type: 'paragraph', text: '' }]),
    });
    editor.mount(container);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      editor.dispatch({
        operations: [{
          type: 'insert_text', path: [0, 0],
          offset: i, data: String.fromCharCode(65 + (i % 26)),
        }],
        origin: 'input',
        timestamp: Date.now() + i * 10, // spread out timestamps for debounce
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(getBlockText(editor.getState().doc, 0)).toHaveLength(50);

    // Undo should work (at least one insert reverted)
    editor.executeCommand('undo');
    const afterUndo = getBlockText(editor.getState().doc, 0);
    expect(afterUndo.length).toBeLessThan(50);
    expect(afterUndo.length).toBeGreaterThanOrEqual(0);

    editor.destroy();
  });

  it('should handle rapid mark toggling', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
    const boldMark = { type: 'bold' as const };

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        doc = applyOperation(doc, {
          type: 'add_mark', path: [0], offset: 0, length: 5,
          mark: boldMark,
        });
      } else {
        doc = applyOperation(doc, {
          type: 'remove_mark', path: [0], offset: 0, length: 5,
          mark: boldMark,
        });
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
    // Text must be preserved after 100 add_mark/remove_mark cycles (last was remove, so no bold)
    expect(getBlockText(doc, 0)).toBe('Hello World');
    // Document structure must remain valid (at least one text node in the block)
    expect(doc.children[0].children.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle rapid block creation', () => {
    let doc = createDocWith([{ type: 'paragraph', text: 'Start' }]);

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      // Split the last block (simulating Enter key)
      const lastBlockIdx = doc.children.length - 1;
      const textLen = getBlockText(doc, lastBlockIdx).length;
      doc = applyOperation(doc, {
        type: 'split_node', path: [lastBlockIdx], offset: doc.children[lastBlockIdx].children.length,
      });

      // Type into the new block
      const newBlockIdx = lastBlockIdx + 1;
      doc = applyOperation(doc, {
        type: 'insert_text', path: [newBlockIdx, 0],
        offset: 0, data: `Line ${i + 1}`,
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(doc.children.length).toBe(201); // 1 original + 200 splits
    expect(getBlockText(doc, 0)).toBe('Start');
    expect(getBlockText(doc, 200)).toBe('Line 200');
  });

  it('should handle interleaved typing and formatting', () => {
    let doc = createDocWith([{ type: 'paragraph', text: '' }]);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      // Type 3 chars
      for (let c = 0; c < 3; c++) {
        const offset = i * 3 + c;
        doc = applyOperation(doc, {
          type: 'insert_text', path: [0, 0],
          offset, data: 'a',
        });
      }
      // Bold the last 3 chars
      doc = applyOperation(doc, {
        type: 'add_mark', path: [0],
        offset: i * 3, length: 3,
        mark: { type: 'bold' },
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(getBlockText(doc, 0)).toHaveLength(150); // 50 * 3 chars
  });

  it('should maintain document integrity after thousands of operations', () => {
    let doc = createDocWith([
      { type: 'paragraph', text: 'Alpha' },
      { type: 'paragraph', text: 'Beta' },
      { type: 'paragraph', text: 'Gamma' },
    ]);

    const start = performance.now();
    // Mix of operations
    for (let i = 0; i < 300; i++) {
      const blockIdx = i % 3;
      switch (i % 4) {
        case 0: // insert text
          doc = applyOperation(doc, {
            type: 'insert_text', path: [blockIdx, 0],
            offset: 0, data: '.',
          });
          break;
        case 1: // delete first char
          if (getBlockText(doc, blockIdx).length > 1) {
            doc = applyOperation(doc, {
              type: 'delete_text', path: [blockIdx, 0],
              offset: 0, length: 1,
            });
          }
          break;
        case 2: // add mark
          doc = applyOperation(doc, {
            type: 'add_mark', path: [blockIdx],
            offset: 0, length: Math.min(3, getBlockText(doc, blockIdx).length),
            mark: { type: 'italic' },
          });
          break;
        case 3: // change type
          doc = applyOperation(doc, {
            type: 'set_node_type', path: [blockIdx],
            nodeType: i % 6 === 3 ? 'heading' : 'paragraph',
          });
          break;
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
    // Document should still have 3 blocks
    expect(doc.children).toHaveLength(3);
    // Each block should have some text
    for (let i = 0; i < 3; i++) {
      expect(getBlockText(doc, i).length).toBeGreaterThan(0);
    }
  });
});
