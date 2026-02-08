import type { Document, ElementNode, EditorNode, Operation, Delta, Mark } from '../core/types';
import { isTextNode, isElementNode } from '../core/types';
import { applyOperation as applyOperationFn } from '../core/operations';

/**
 * Generate a Delta (list of operations) that transforms prevDoc into nextDoc.
 */
export function generateDelta(
  prevDoc: Document,
  nextDoc: Document,
  clientId: string,
): Delta {
  const operations: Operation[] = [];
  diffBlocks(prevDoc, nextDoc, operations);

  return {
    operations,
    baseVersion: prevDoc.version,
    resultVersion: nextDoc.version,
    clientId,
    timestamp: Date.now(),
  };
}

function diffBlocks(prevDoc: Document, nextDoc: Document, ops: Operation[]): void {
  const prevMap = new Map<string, { node: ElementNode; index: number }>();
  prevDoc.children.forEach((child, i) => prevMap.set(child.id, { node: child, index: i }));

  const nextMap = new Map<string, { node: ElementNode; index: number }>();
  nextDoc.children.forEach((child, i) => nextMap.set(child.id, { node: child, index: i }));

  // Detect deleted blocks
  for (const [id, { index }] of prevMap) {
    if (!nextMap.has(id)) {
      ops.push({ type: 'delete_node', path: [], offset: index });
    }
  }

  // Detect inserted blocks and modifications
  for (const [id, { node: nextNode, index: nextIndex }] of nextMap) {
    const prev = prevMap.get(id);
    if (!prev) {
      // New block
      ops.push({ type: 'insert_node', path: [], offset: nextIndex, data: nextNode });
    } else {
      // Existing block — check for changes
      diffBlock(prev.node, nextNode, [nextIndex], ops);
    }
  }
}

function diffBlock(prev: ElementNode, next: ElementNode, path: number[], ops: Operation[]): void {
  // Type change
  if (prev.type !== next.type) {
    ops.push({ type: 'set_node_type', path, nodeType: next.type });
  }

  // Attrs change
  if (JSON.stringify(prev.attrs) !== JSON.stringify(next.attrs)) {
    ops.push({ type: 'update_attrs', path, attrs: next.attrs as Record<string, unknown> });
  }

  // Diff inline children (text nodes)
  diffInlineChildren(prev, next, path, ops);
}

function diffInlineChildren(
  prev: ElementNode,
  next: ElementNode,
  blockPath: number[],
  ops: Operation[],
): void {
  const prevText = getBlockTextContent(prev);
  const nextText = getBlockTextContent(next);

  if (prevText !== nextText) {
    // Simple text diff: find common prefix and suffix
    let commonPrefix = 0;
    while (commonPrefix < prevText.length && commonPrefix < nextText.length && prevText[commonPrefix] === nextText[commonPrefix]) {
      commonPrefix++;
    }

    let commonSuffix = 0;
    while (
      commonSuffix < prevText.length - commonPrefix &&
      commonSuffix < nextText.length - commonPrefix &&
      prevText[prevText.length - 1 - commonSuffix] === nextText[nextText.length - 1 - commonSuffix]
    ) {
      commonSuffix++;
    }

    const deleteLen = prevText.length - commonPrefix - commonSuffix;
    const insertText = nextText.slice(commonPrefix, nextText.length - commonSuffix);

    if (deleteLen > 0) {
      ops.push({
        type: 'delete_text',
        path: [...blockPath, 0],
        offset: commonPrefix,
        length: deleteLen,
      });
    }

    if (insertText.length > 0) {
      ops.push({
        type: 'insert_text',
        path: [...blockPath, 0],
        offset: commonPrefix,
        data: insertText,
      });
    }
  }

  // Diff marks
  diffMarks(prev, next, blockPath, ops);
}

function diffMarks(
  prev: ElementNode,
  next: ElementNode,
  blockPath: number[],
  ops: Operation[],
): void {
  const prevMarks = collectMarkRanges(prev);
  const nextMarks = collectMarkRanges(next);

  // Find marks to remove
  for (const [key, range] of prevMarks) {
    if (!nextMarks.has(key)) {
      ops.push({
        type: 'remove_mark',
        path: blockPath,
        offset: range.from,
        length: range.to - range.from,
        mark: range.mark,
      });
    }
  }

  // Find marks to add
  for (const [key, range] of nextMarks) {
    if (!prevMarks.has(key)) {
      ops.push({
        type: 'add_mark',
        path: blockPath,
        offset: range.from,
        length: range.to - range.from,
        mark: range.mark,
      });
    }
  }
}

interface MarkRange {
  from: number;
  to: number;
  mark: Mark;
}

function collectMarkRanges(block: ElementNode): Map<string, MarkRange> {
  const ranges = new Map<string, MarkRange>();
  let offset = 0;

  for (const child of block.children) {
    if (isTextNode(child)) {
      for (const mark of child.marks) {
        const key = `${mark.type}:${offset}:${offset + child.text.length}`;
        ranges.set(key, { from: offset, to: offset + child.text.length, mark });
      }
      offset += child.text.length;
    }
  }

  return ranges;
}

function getBlockTextContent(block: ElementNode): string {
  return block.children
    .filter(isTextNode)
    .map((n) => n.text)
    .join('');
}

/**
 * Apply a Delta to a document.
 */
export function applyDelta(doc: Document, delta: Delta): Document {
  let result = doc;
  for (const op of delta.operations) {
    result = applyOperationFn(result, op);
  }
  return { ...result, version: delta.resultVersion };
}
