import type {
  Document,
  EditorNode,
  ElementNode,
  TextNode,
  Operation,
  Transaction,
  ContentState,
  Mark,
} from './types';
import { generateId, isTextNode, isElementNode } from './types';

// ─── Structural Sharing Helpers ──────────────────────────────

export function replaceChild<T extends ElementNode | Document>(
  parent: T,
  index: number,
  newChild: EditorNode,
): T {
  const children = [...parent.children];
  children[index] = newChild as ElementNode & EditorNode;
  return { ...parent, children } as T;
}

function spliceChildren<T extends ElementNode | Document>(
  parent: T,
  index: number,
  deleteCount: number,
  ...items: EditorNode[]
): T {
  const children = [...parent.children];
  children.splice(index, deleteCount, ...items as (ElementNode & EditorNode)[]);
  return { ...parent, children } as T;
}

function resolveNode(doc: Document, path: readonly number[]): EditorNode {
  let current: EditorNode | Document = doc;
  for (const idx of path) {
    if ('children' in current) {
      current = current.children[idx];
    } else {
      throw new Error(`Invalid path: cannot descend into text node at ${path.join(',')}`);
    }
  }
  return current as EditorNode;
}

function updateAtPath(
  doc: Document,
  path: readonly number[],
  updater: (node: EditorNode) => EditorNode,
): Document {
  if (path.length === 0) {
    throw new Error('Cannot update document root via path');
  }

  function recurse(parent: Document | ElementNode, depth: number): Document | ElementNode {
    const idx = path[depth];
    if (depth === path.length - 1) {
      // Leaf: apply updater
      const child = parent.children[idx];
      const updated = updater(child);
      return replaceChild(parent as Document & ElementNode, idx, updated);
    }
    // Recurse
    const child = parent.children[idx];
    if (!isElementNode(child) && !(child as unknown as Document).kind) {
      throw new Error(`Cannot descend into non-element node at path ${path.slice(0, depth + 1).join(',')}`);
    }
    const updatedChild = recurse(child as ElementNode, depth + 1);
    return replaceChild(parent as Document & ElementNode, idx, updatedChild as EditorNode);
  }

  return recurse(doc, 0) as Document;
}

// ─── Text Operations ─────────────────────────────────────────

function insertText(doc: Document, path: readonly number[], offset: number, text: string): Document {
  return updateAtPath(doc, path, (node) => {
    if (!isTextNode(node)) throw new Error('insert_text target must be a text node');
    return {
      ...node,
      text: node.text.slice(0, offset) + text + node.text.slice(offset),
    };
  });
}

function deleteText(doc: Document, path: readonly number[], offset: number, length: number): Document {
  return updateAtPath(doc, path, (node) => {
    if (!isTextNode(node)) throw new Error('delete_text target must be a text node');
    return {
      ...node,
      text: node.text.slice(0, offset) + node.text.slice(offset + length),
    };
  });
}

// ─── Node Operations ─────────────────────────────────────────

function insertNode(doc: Document, path: readonly number[], offset: number, node: EditorNode): Document {
  if (path.length === 0) {
    // Insert at document root level
    return spliceChildren(doc, offset, 0, node);
  }
  const parentPath = path;
  return updateAtPath(doc, parentPath, (parent) => {
    if (!isElementNode(parent)) throw new Error('insert_node parent must be an element node');
    return spliceChildren(parent, offset, 0, node);
  });
}

function deleteNode(doc: Document, path: readonly number[], offset: number): Document {
  if (path.length === 0) {
    // Delete at document root level
    return spliceChildren(doc, offset, 1);
  }
  return updateAtPath(doc, path, (parent) => {
    if (!isElementNode(parent)) throw new Error('delete_node parent must be an element node');
    return spliceChildren(parent, offset, 1);
  });
}

function setNodeType(doc: Document, path: readonly number[], nodeType: string): Document {
  return updateAtPath(doc, path, (node) => {
    if (!isElementNode(node)) throw new Error('set_node_type target must be an element node');
    return { ...node, type: nodeType };
  });
}

function updateAttrs(doc: Document, path: readonly number[], attrs: Record<string, unknown>): Document {
  return updateAtPath(doc, path, (node) => {
    if (!isElementNode(node)) throw new Error('update_attrs target must be an element node');
    return { ...node, attrs: { ...node.attrs, ...attrs } };
  });
}

// ─── Mark Operations ─────────────────────────────────────────

function marksEqual(a: Mark, b: Mark): boolean {
  if (a.type !== b.type) return false;
  if (!a.attrs && !b.attrs) return true;
  if (!a.attrs || !b.attrs) return false;
  const keysA = Object.keys(a.attrs);
  const keysB = Object.keys(b.attrs);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a.attrs![k] === b.attrs![k]);
}

function hasMark(marks: readonly Mark[], mark: Mark): boolean {
  return marks.some((m) => marksEqual(m, mark));
}

function addMarkToTextNode(node: TextNode, mark: Mark): TextNode {
  if (hasMark(node.marks, mark)) return node;
  return { ...node, marks: [...node.marks, mark] };
}

function removeMarkFromTextNode(node: TextNode, markType: string, markAttrs?: Readonly<Record<string, unknown>>): TextNode {
  const filtered = node.marks.filter((m) => {
    if (m.type !== markType) return true;
    // If no attrs specified on removal, match by type only (loose match)
    if (!markAttrs) return false;
    return !marksEqual(m, { type: markType, attrs: markAttrs });
  });
  if (filtered.length === node.marks.length) return node;
  return { ...node, marks: filtered };
}

function addMark(
  doc: Document,
  path: readonly number[],
  offset: number,
  length: number,
  mark: Mark,
): Document {
  // path points to a block, offset/length define text range within it
  return updateAtPath(doc, path, (block) => {
    if (!isElementNode(block)) throw new Error('add_mark target must be an element node');
    return applyMarkToRange(block, offset, length, mark, 'add');
  });
}

function removeMark(
  doc: Document,
  path: readonly number[],
  offset: number,
  length: number,
  mark: Mark,
): Document {
  return updateAtPath(doc, path, (block) => {
    if (!isElementNode(block)) throw new Error('remove_mark target must be an element node');
    return applyMarkToRange(block, offset, length, mark, 'remove');
  });
}

function applyMarkToRange(
  block: ElementNode,
  offset: number,
  length: number,
  mark: Mark,
  action: 'add' | 'remove',
): ElementNode {
  const from = offset;
  const to = offset + length;
  let charPos = 0;
  const newChildren: EditorNode[] = [];

  for (const child of block.children) {
    if (!isTextNode(child)) {
      newChildren.push(child);
      continue;
    }

    const nodeStart = charPos;
    const nodeEnd = charPos + child.text.length;
    charPos = nodeEnd;

    if (nodeEnd <= from || nodeStart >= to) {
      // Outside range
      newChildren.push(child);
      continue;
    }

    // Split into up to 3 segments: before, overlap, after
    const overlapStart = Math.max(from, nodeStart) - nodeStart;
    const overlapEnd = Math.min(to, nodeEnd) - nodeStart;

    if (overlapStart > 0) {
      newChildren.push({
        id: generateId(),
        kind: 'text',
        text: child.text.slice(0, overlapStart),
        marks: child.marks,
      });
    }

    const overlapText = child.text.slice(overlapStart, overlapEnd);
    if (overlapText) {
      const modifiedNode: TextNode = action === 'add'
        ? addMarkToTextNode({ ...child, id: generateId(), text: overlapText }, mark)
        : removeMarkFromTextNode({ ...child, id: generateId(), text: overlapText }, mark.type, mark.attrs);
      newChildren.push(modifiedNode);
    }

    if (overlapEnd < child.text.length) {
      newChildren.push({
        id: generateId(),
        kind: 'text',
        text: child.text.slice(overlapEnd),
        marks: child.marks,
      });
    }
  }

  return { ...block, children: newChildren };
}

// ─── Structural Operations ───────────────────────────────────

function wrapNode(
  doc: Document,
  path: readonly number[],
  offset: number,
  wrapperType: string,
  wrapperAttrs: Record<string, unknown> = {},
): Document {
  if (path.length === 0) {
    // Wrap a document-level block
    const child = doc.children[offset];
    const wrapper: ElementNode = {
      id: generateId(),
      kind: 'element',
      type: wrapperType,
      attrs: wrapperAttrs,
      children: [child],
    };
    return spliceChildren(doc, offset, 1, wrapper);
  }
  return updateAtPath(doc, path, (parent) => {
    if (!isElementNode(parent)) throw new Error('wrap_node parent must be an element node');
    const child = parent.children[offset];
    const wrapper: ElementNode = {
      id: generateId(),
      kind: 'element',
      type: wrapperType,
      attrs: wrapperAttrs,
      children: [child],
    };
    return spliceChildren(parent, offset, 1, wrapper);
  });
}

function liftNode(
  doc: Document,
  path: readonly number[],
  offset: number,
): Document {
  if (path.length === 0) {
    // Lift from document root: unwrap the wrapper, replace with its children
    const wrapper = doc.children[offset];
    if (!isElementNode(wrapper)) throw new Error('lift_node target must be an element node');
    const children = [...doc.children];
    children.splice(offset, 1, ...wrapper.children as ElementNode[]);
    return { ...doc, children };
  }
  return updateAtPath(doc, path, (parent) => {
    if (!isElementNode(parent)) throw new Error('lift_node parent must be an element node');
    const wrapper = parent.children[offset];
    if (!isElementNode(wrapper)) throw new Error('lift_node target must be an element node');
    const children = [...parent.children];
    children.splice(offset, 1, ...wrapper.children as ElementNode[]);
    return { ...parent, children };
  });
}

function moveNode(
  doc: Document,
  fromPath: readonly number[],
  fromOffset: number,
  toPath: readonly number[],
  toOffset: number,
): Document {
  // Get the node to move
  let node: EditorNode;
  if (fromPath.length === 0) {
    node = doc.children[fromOffset];
  } else {
    const parent = resolveNode(doc, fromPath);
    if (!isElementNode(parent)) throw new Error('move_node source parent must be an element');
    node = parent.children[fromOffset];
  }

  // Delete from source
  let result = deleteNode(doc, fromPath, fromOffset);

  // Adjust target offset if needed (if moving within same parent and target is after source)
  let adjustedToOffset = toOffset;
  if (
    fromPath.length === toPath.length &&
    fromPath.every((v, i) => v === toPath[i]) &&
    fromOffset < toOffset
  ) {
    adjustedToOffset--;
  }

  // Insert at target
  result = insertNode(result, toPath, adjustedToOffset, node);
  return result;
}

function splitNode(
  doc: Document,
  path: readonly number[],
  offset: number,
): Document {
  return updateAtPath(doc, path, (node) => {
    if (isTextNode(node)) {
      // Split text node into two
      const before: TextNode = { id: node.id, kind: 'text', text: node.text.slice(0, offset), marks: node.marks };
      const after: TextNode = { id: generateId(), kind: 'text', text: node.text.slice(offset), marks: node.marks };
      // Return as a wrapper — caller needs to handle this differently
      // Actually split_node at block level is more useful
      return before; // For text, we handle differently
    }
    if (isElementNode(node)) {
      // Split element: children[0..offset-1] stay, children[offset..] go to new sibling
      const beforeChildren = node.children.slice(0, offset);
      const afterChildren = node.children.slice(offset);
      // We return the "before" part; the "after" part needs to be inserted by the caller
      return { ...node, children: beforeChildren } as EditorNode;
    }
    return node;
  });
}

function splitBlock(doc: Document, blockPath: readonly number[], childOffset: number): Document {
  if (blockPath.length === 0) {
    throw new Error('split_node requires a path to the block to split');
  }

  const parentPath = blockPath.slice(0, -1);
  const blockIndex = blockPath[blockPath.length - 1];

  const updateParent = (parent: ElementNode | Document): ElementNode | Document => {
    const block = parent.children[blockIndex] as ElementNode;
    if (!isElementNode(block)) throw new Error('split_node target must be an element');

    const beforeChildren = block.children.slice(0, childOffset);
    const afterChildren = block.children.slice(childOffset);

    const beforeBlock: ElementNode = { ...block, children: beforeChildren };
    const afterBlock: ElementNode = {
      id: generateId(),
      kind: 'element',
      type: block.type,
      attrs: block.attrs,
      children: afterChildren.length > 0 ? afterChildren : [{ id: generateId(), kind: 'text', text: '', marks: [] }],
    };

    const children = [...parent.children];
    children.splice(blockIndex, 1, beforeBlock as ElementNode & EditorNode, afterBlock as ElementNode & EditorNode);
    return { ...parent, children } as ElementNode | Document;
  };

  if (parentPath.length === 0) {
    return updateParent(doc) as Document;
  }

  return updateAtPath(doc, parentPath, (node) => {
    if (!isElementNode(node)) throw new Error('split_node parent must be an element');
    return updateParent(node) as EditorNode;
  });
}

function mergeNodes(doc: Document, path: readonly number[], offset: number): Document {
  // Merge node at offset with node at offset-1
  if (offset <= 0) throw new Error('merge_nodes requires offset > 0');

  if (path.length === 0) {
    // Merge at document root level
    const first = doc.children[offset - 1];
    const second = doc.children[offset];
    if (!isElementNode(first) || !isElementNode(second)) {
      throw new Error('merge_nodes targets must be element nodes');
    }
    const merged: ElementNode = {
      ...first,
      children: [...first.children, ...second.children],
    };
    const children = [...doc.children];
    children.splice(offset - 1, 2, merged);
    return { ...doc, children };
  }

  return updateAtPath(doc, path, (parent) => {
    if (!isElementNode(parent)) throw new Error('merge_nodes parent must be an element');
    const first = parent.children[offset - 1];
    const second = parent.children[offset];
    if (!isElementNode(first) || !isElementNode(second)) {
      throw new Error('merge_nodes targets must be element nodes');
    }
    const merged: ElementNode = {
      ...first,
      children: [...first.children, ...second.children],
    };
    const children = [...parent.children];
    children.splice(offset - 1, 2, merged);
    return { ...parent, children };
  });
}

// ─── Apply Operation ─────────────────────────────────────────

export function applyOperation(doc: Document, op: Operation): Document {
  switch (op.type) {
    case 'insert_text':
      return insertText(doc, op.path, op.offset ?? 0, op.data as string);

    case 'delete_text':
      return deleteText(doc, op.path, op.offset ?? 0, op.length ?? 0);

    case 'insert_node':
      return insertNode(doc, op.path, op.offset ?? 0, op.data as EditorNode);

    case 'delete_node':
      return deleteNode(doc, op.path, op.offset ?? 0);

    case 'set_node_type':
      return setNodeType(doc, op.path, op.nodeType!);

    case 'update_attrs':
      return updateAttrs(doc, op.path, op.attrs as Record<string, unknown>);

    case 'add_mark':
      return addMark(doc, op.path, op.offset ?? 0, op.length ?? 0, op.mark!);

    case 'remove_mark':
      return removeMark(doc, op.path, op.offset ?? 0, op.length ?? 0, op.mark!);

    case 'wrap_node': {
      const wrapAttrs = op.attrs as Record<string, unknown> | undefined;
      return wrapNode(doc, op.path, op.offset ?? 0, op.nodeType!, wrapAttrs ?? {});
    }

    case 'lift_node':
      return liftNode(doc, op.path, op.offset ?? 0);

    case 'move_node':
      return moveNode(doc, op.path, op.offset ?? 0, op.targetPath ?? [], (op.data as number) ?? 0);

    case 'split_node':
      return splitBlock(doc, op.path, op.offset ?? 0);

    case 'merge_nodes':
      return mergeNodes(doc, op.path, op.offset ?? 0);

    default:
      throw new Error(`Unknown operation type: ${op.type}`);
  }
}

// ─── Apply Transaction ───────────────────────────────────────

export function applyTransaction(state: ContentState, tr: Transaction): ContentState {
  // If the transaction provides a full document, use it directly
  if (tr.doc) {
    return {
      doc: tr.doc,
      selection: tr.selection !== undefined ? tr.selection : state.selection,
    };
  }

  let doc = state.doc;
  for (const op of tr.operations) {
    doc = applyOperation(doc, op);
  }

  // Bump version
  doc = { ...doc, version: doc.version + 1 };

  return {
    doc,
    selection: tr.selection !== undefined ? tr.selection : state.selection,
  };
}
