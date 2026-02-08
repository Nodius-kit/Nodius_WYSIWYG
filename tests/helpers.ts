import type { Document, ElementNode, TextNode, EditorNode, Mark, ContentState } from '../src/core/types';
import { generateId } from '../src/core/types';

/**
 * Create a Document from shorthand block descriptions.
 * Example: createDocWith([{ type: 'paragraph', text: 'Hello' }])
 */
export function createDocWith(
  blocks: Array<{
    type: string;
    text?: string;
    marks?: Mark[];
    attrs?: Record<string, unknown>;
    children?: EditorNode[];
  }>,
): Document {
  const children: ElementNode[] = blocks.map((b) => ({
    id: generateId(),
    kind: 'element' as const,
    type: b.type,
    attrs: b.attrs ?? {},
    children: b.children ?? (b.text !== undefined
      ? [{
          id: generateId(),
          kind: 'text' as const,
          text: b.text,
          marks: b.marks ?? [],
        }]
      : []),
  }));

  return {
    id: generateId(),
    kind: 'document',
    children,
    version: 0,
  };
}

/**
 * Create a ContentState from shorthand.
 */
export function createStateWith(
  blocks: Array<{
    type: string;
    text?: string;
    marks?: Mark[];
    attrs?: Record<string, unknown>;
    children?: EditorNode[];
  }>,
): ContentState {
  return {
    doc: createDocWith(blocks),
    selection: null,
  };
}

/**
 * Extract all text from a document.
 */
export function extractText(doc: Document): string {
  function walkNode(node: EditorNode): string {
    if (node.kind === 'text') return node.text;
    if (node.kind === 'element') return node.children.map(walkNode).join('');
    return '';
  }
  return doc.children.map(walkNode).join('\n');
}

/**
 * Get the text of a specific block by index.
 */
export function getBlockText(doc: Document, blockIndex: number): string {
  const block = doc.children[blockIndex];
  if (!block) return '';
  return block.children
    .filter((c): c is TextNode => c.kind === 'text')
    .map((c) => c.text)
    .join('');
}

/**
 * Get marks of text at a specific position within a block.
 */
export function getMarksAt(doc: Document, blockIndex: number, charOffset: number): readonly Mark[] {
  const block = doc.children[blockIndex];
  if (!block) return [];
  let pos = 0;
  for (const child of block.children) {
    if (child.kind !== 'text') continue;
    if (charOffset >= pos && charOffset < pos + child.text.length) {
      return child.marks;
    }
    pos += child.text.length;
  }
  return [];
}
