import type { EditorSelection, Position, Operation, EditorNode, Document } from './types';
import { isTextNode, isElementNode } from './types';

export class SelectionManager {
  private editableElement: HTMLElement | null = null;

  setEditable(el: HTMLElement | null): void {
    this.editableElement = el;
  }

  capture(): EditorSelection | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.editableElement) return null;

    const range = sel.getRangeAt(0);
    if (!this.editableElement.contains(range.startContainer)) return null;

    const anchor = this.resolveFromDOM(range.startContainer, range.startOffset);
    const focus = sel.isCollapsed
      ? anchor
      : this.resolveFromDOM(range.endContainer, range.endOffset);

    if (!anchor || !focus) return null;
    return { anchor, focus };
  }

  restore(selection: EditorSelection): void {
    if (!this.editableElement) return;

    const anchorResult = this.resolveToDOMPosition(selection.anchor);
    const focusResult = this.resolveToDOMPosition(selection.focus);

    if (!anchorResult || !focusResult) return;

    const sel = window.getSelection();
    if (!sel) return;

    const range = document.createRange();
    range.setStart(anchorResult.node, anchorResult.offset);
    range.setEnd(focusResult.node, focusResult.offset);

    sel.removeAllRanges();
    sel.addRange(range);
  }

  fromDOMRange(range: Range): EditorSelection | null {
    if (!this.editableElement) return null;
    const anchor = this.resolveFromDOM(range.startContainer, range.startOffset);
    const focus = this.resolveFromDOM(range.endContainer, range.endOffset);
    if (!anchor || !focus) return null;
    return { anchor, focus };
  }

  toDOMRange(selection: EditorSelection): Range | null {
    const anchorResult = this.resolveToDOMPosition(selection.anchor);
    const focusResult = this.resolveToDOMPosition(selection.focus);
    if (!anchorResult || !focusResult) return null;

    const range = document.createRange();
    range.setStart(anchorResult.node, anchorResult.offset);
    range.setEnd(focusResult.node, focusResult.offset);
    return range;
  }

  mapThrough(selection: EditorSelection, ops: readonly Operation[]): EditorSelection {
    return {
      anchor: this.mapPositionThrough(selection.anchor, ops),
      focus: this.mapPositionThrough(selection.focus, ops),
    };
  }

  mapPositionThrough(pos: Position, ops: readonly Operation[]): Position {
    let result = pos;
    for (const op of ops) {
      result = this.mapPositionThroughOp(result, op);
    }
    return result;
  }

  // ─── DOM → EditorSelection resolution ──────────────────

  private resolveFromDOM(domNode: Node, domOffset: number): Position | null {
    if (!this.editableElement) return null;

    // Find the nearest block element with data-node-id
    const blockEl = this.findBlockElement(domNode);
    if (!blockEl) return null;

    const blockIndex = this.getBlockIndex(blockEl);
    if (blockIndex === -1) return null;

    // Calculate character offset within the block
    const offset = this.calculateCharOffset(blockEl, domNode, domOffset);

    return { blockIndex, path: [], offset };
  }

  private findBlockElement(node: Node): HTMLElement | null {
    let current: Node | null = node;
    while (current && current !== this.editableElement) {
      if (
        current instanceof HTMLElement &&
        current.hasAttribute('data-node-id') &&
        current.parentElement === this.editableElement
      ) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  private getBlockIndex(blockEl: HTMLElement): number {
    if (!this.editableElement) return -1;
    const children = Array.from(this.editableElement.children);
    return children.indexOf(blockEl);
  }

  private calculateCharOffset(blockEl: HTMLElement, targetNode: Node, targetOffset: number): number {
    let offset = 0;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;

    while ((textNode = walker.nextNode() as Text | null)) {
      if (textNode === targetNode) {
        return offset + targetOffset;
      }
      offset += textNode.textContent?.length ?? 0;
    }

    // If target is an element, count all text before it
    if (targetNode === blockEl || targetNode.contains(blockEl)) {
      return targetOffset;
    }

    return offset;
  }

  // ─── EditorSelection → DOM resolution ──────────────────

  private resolveToDOMPosition(pos: Position): { node: Node; offset: number } | null {
    if (!this.editableElement) return null;

    const blockEl = this.editableElement.children[pos.blockIndex] as HTMLElement | undefined;
    if (!blockEl) return null;

    // Walk text nodes to find the right position
    let remaining = pos.offset;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;

    while ((textNode = walker.nextNode() as Text | null)) {
      const len = textNode.textContent?.length ?? 0;
      if (remaining <= len) {
        return { node: textNode, offset: remaining };
      }
      remaining -= len;
    }

    // Fallback: end of block
    return { node: blockEl, offset: blockEl.childNodes.length };
  }

  // ─── Position mapping through operations ───────────────

  private mapPositionThroughOp(pos: Position, op: Operation): Position {
    switch (op.type) {
      case 'insert_text': {
        // If same block and text was inserted before our offset, shift right
        if (op.path.length >= 1 && op.path[0] === pos.blockIndex) {
          const insertOffset = op.offset ?? 0;
          if (insertOffset <= pos.offset) {
            const insertedLength = typeof op.data === 'string' ? op.data.length : 0;
            return { ...pos, offset: pos.offset + insertedLength };
          }
        }
        return pos;
      }

      case 'delete_text': {
        if (op.path.length >= 1 && op.path[0] === pos.blockIndex) {
          const delStart = op.offset ?? 0;
          const delLength = op.length ?? 0;
          const delEnd = delStart + delLength;

          if (pos.offset <= delStart) {
            return pos; // Before deletion
          } else if (pos.offset >= delEnd) {
            return { ...pos, offset: pos.offset - delLength }; // After deletion
          } else {
            return { ...pos, offset: delStart }; // Inside deletion
          }
        }
        return pos;
      }

      case 'insert_node': {
        if (op.path.length === 0) {
          // Block inserted at document level
          const insertAt = op.offset ?? 0;
          if (insertAt <= pos.blockIndex) {
            return { ...pos, blockIndex: pos.blockIndex + 1 };
          }
        }
        return pos;
      }

      case 'delete_node': {
        if (op.path.length === 0) {
          const delAt = op.offset ?? 0;
          if (delAt < pos.blockIndex) {
            return { ...pos, blockIndex: pos.blockIndex - 1 };
          } else if (delAt === pos.blockIndex) {
            // Our block was deleted — move to previous or start
            return { ...pos, blockIndex: Math.max(0, pos.blockIndex - 1), offset: 0 };
          }
        }
        return pos;
      }

      case 'split_node': {
        if (op.path.length >= 1 && op.path[0] === pos.blockIndex) {
          // Block was split; if offset is after split point, move to next block
          // This is a simplified mapping
          return pos;
        }
        if (op.path.length >= 1 && op.path[0] < pos.blockIndex) {
          return { ...pos, blockIndex: pos.blockIndex + 1 };
        }
        return pos;
      }

      case 'merge_nodes': {
        if (op.path.length === 0) {
          const mergeAt = op.offset ?? 0;
          if (mergeAt === pos.blockIndex) {
            // Our block was merged into previous
            return { ...pos, blockIndex: pos.blockIndex - 1 };
          } else if (mergeAt < pos.blockIndex) {
            return { ...pos, blockIndex: pos.blockIndex - 1 };
          }
        }
        return pos;
      }

      default:
        return pos;
    }
  }
}
