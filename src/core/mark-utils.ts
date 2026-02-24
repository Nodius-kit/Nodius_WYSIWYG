import type { ContentState, EditorInterface, Mark, Position } from './types';
import { isTextNode } from './types';

/**
 * Check if the text at the anchor position has a specific mark.
 */
export function selectionHasMark(state: ContentState, markType: string): boolean {
  if (!state.selection) return false;
  const { anchor } = state.selection;
  const block = state.doc.children[anchor.blockIndex];
  if (!block) return false;

  let pos = 0;
  for (const child of block.children) {
    if (!isTextNode(child)) continue;
    const end = pos + child.text.length;
    if (anchor.offset >= pos && anchor.offset <= end) {
      return child.marks.some((m) => m.type === markType);
    }
    pos = end;
  }
  return false;
}

/**
 * Get the marks on the text node at a given position.
 */
export function getMarksAtPosition(state: ContentState, position: Position): readonly Mark[] {
  const block = state.doc.children[position.blockIndex];
  if (!block) return [];

  let pos = 0;
  for (const child of block.children) {
    if (!isTextNode(child)) continue;
    const end = pos + child.text.length;
    if (position.offset >= pos && position.offset <= end) {
      return child.marks;
    }
    pos = end;
  }
  return [];
}

/**
 * Check if a mark type is active — either on the text at cursor or in storedMarks.
 * When storedMarks is explicitly set (even to []), it is authoritative.
 */
export function isMarkActive(state: ContentState, markType: string): boolean {
  if (state.storedMarks !== null && state.storedMarks !== undefined) {
    return state.storedMarks.some((m) => m.type === markType);
  }
  return selectionHasMark(state, markType);
}

/**
 * Toggle a mark. If selection is collapsed, toggle in storedMarks.
 * If selection is a range, apply add_mark/remove_mark.
 */
export function toggleMarkOrStore(editor: EditorInterface, markType: string, markAttrs?: Record<string, unknown>): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);
  const mark: Mark = markAttrs ? { type: markType, attrs: markAttrs } : { type: markType };

  // Collapsed selection: toggle stored marks
  if (from === to) {
    const current = state.storedMarks ?? getMarksAtPosition(state, anchor);
    const has = current.some((m) => m.type === markType);
    const newStored = has
      ? current.filter((m) => m.type !== markType)
      : [...current, mark];
    editor.dispatch({
      operations: [],
      storedMarks: newStored,
      origin: 'command',
      timestamp: Date.now(),
    });
    return true;
  }

  // Range selection: apply mark operation
  const hasMark = selectionHasMark(state, markType);
  editor.dispatch({
    operations: [{
      type: hasMark ? 'remove_mark' : 'add_mark',
      path: [anchor.blockIndex],
      offset: from,
      length: to - from,
      mark,
    }],
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}

/**
 * Toggle a mark with mutual exclusion. If selection is collapsed, toggle in storedMarks.
 */
export function toggleMarkExclusiveOrStore(
  editor: EditorInterface,
  markType: string,
  exclusiveWith: string,
): boolean {
  const state = editor.getState();
  if (!state.selection) return false;

  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);

  // Collapsed selection: toggle stored marks with exclusion
  if (from === to) {
    let current = [...(state.storedMarks ?? getMarksAtPosition(state, anchor))];
    const has = current.some((m) => m.type === markType);
    // Remove exclusive mark
    current = current.filter((m) => m.type !== exclusiveWith);
    if (has) {
      current = current.filter((m) => m.type !== markType);
    } else {
      current.push({ type: markType });
    }
    editor.dispatch({
      operations: [],
      storedMarks: current,
      origin: 'command',
      timestamp: Date.now(),
    });
    return true;
  }

  // Range selection
  const hasMark = selectionHasMark(state, markType);
  const hasExclusive = selectionHasMark(state, exclusiveWith);
  const ops = [];

  if (hasExclusive) {
    ops.push({
      type: 'remove_mark' as const,
      path: [anchor.blockIndex],
      offset: from,
      length: to - from,
      mark: { type: exclusiveWith },
    });
  }

  ops.push({
    type: hasMark ? 'remove_mark' as const : 'add_mark' as const,
    path: [anchor.blockIndex],
    offset: from,
    length: to - from,
    mark: { type: markType },
  });

  editor.dispatch({
    operations: ops,
    origin: 'command',
    timestamp: Date.now(),
  });
  return true;
}
