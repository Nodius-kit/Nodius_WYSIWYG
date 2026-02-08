import type {
  Document,
  EditorNode,
  ElementNode,
  TextNode,
  Mark,
  NodeTypeSpec,
  MarkTypeSpec,
} from './types';
import { generateId, isTextNode, isElementNode } from './types';

// ─── JSON Import ──────────────────────────────────────────────

function regenerateIds(node: EditorNode): EditorNode {
  if (isTextNode(node)) {
    return { ...node, id: generateId() };
  }
  if (isElementNode(node)) {
    return {
      ...node,
      id: generateId(),
      children: node.children.map(regenerateIds),
    };
  }
  return node;
}

export function fromJSON(json: string): Document {
  const parsed = JSON.parse(json);

  if (!parsed || parsed.kind !== 'document' || !Array.isArray(parsed.children)) {
    throw new Error('Invalid document JSON: expected { kind: "document", children: [...] }');
  }

  const children = (parsed.children as ElementNode[]).map(
    (child) => regenerateIds(child) as ElementNode,
  );

  return {
    id: generateId(),
    kind: 'document',
    children,
    version: 0,
  };
}

// ─── HTML Import ──────────────────────────────────────────────

interface ImportSpecs {
  nodeTypes: readonly NodeTypeSpec[];
  markTypes: readonly MarkTypeSpec[];
}

function matchParseRules(
  el: HTMLElement,
  specs: { nodeTypes: Map<string, NodeTypeSpec>; markTypes: Map<string, MarkTypeSpec> },
): { type: 'node'; spec: NodeTypeSpec; attrs: Record<string, unknown> } |
   { type: 'mark'; spec: MarkTypeSpec; attrs: Record<string, unknown> } |
   null {
  // Check node types
  for (const spec of specs.nodeTypes.values()) {
    if (!spec.parseDOM) continue;
    for (const rule of spec.parseDOM) {
      if (rule.tag && el.matches(rule.tag)) {
        const attrs = rule.getAttrs ? rule.getAttrs(el) : {};
        if (attrs === false) continue;
        return { type: 'node', spec, attrs };
      }
    }
  }

  // Check mark types
  for (const spec of specs.markTypes.values()) {
    if (!spec.parseDOM) continue;
    for (const rule of spec.parseDOM) {
      if (rule.tag && el.matches(rule.tag)) {
        const attrs = rule.getAttrs ? rule.getAttrs(el) : {};
        if (attrs === false) continue;
        return { type: 'mark', spec, attrs };
      }
    }
  }

  return null;
}

function parseInlineContent(
  node: Node,
  specs: { nodeTypes: Map<string, NodeTypeSpec>; markTypes: Map<string, MarkTypeSpec> },
  inheritedMarks: Mark[],
): TextNode[] {
  const result: TextNode[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) { // Text node
      const text = child.textContent ?? '';
      if (text) {
        result.push({
          id: generateId(),
          kind: 'text',
          text,
          marks: [...inheritedMarks],
        });
      }
    } else if (child.nodeType === 1) { // Element
      const el = child as HTMLElement;
      const match = matchParseRules(el, specs);

      if (match && match.type === 'mark') {
        // This element represents a mark
        const mark: Mark = { type: match.spec.name, ...(Object.keys(match.attrs).length > 0 ? { attrs: match.attrs } : {}) };
        const innerNodes = parseInlineContent(el, specs, [...inheritedMarks, mark]);
        result.push(...innerNodes);
      } else {
        // Unknown inline element — descend
        const innerNodes = parseInlineContent(el, specs, inheritedMarks);
        result.push(...innerNodes);
      }
    }
  }

  return result;
}

function parseElement(
  el: HTMLElement,
  specs: { nodeTypes: Map<string, NodeTypeSpec>; markTypes: Map<string, MarkTypeSpec> },
): ElementNode | null {
  const match = matchParseRules(el, specs);

  if (match && match.type === 'node') {
    const spec = match.spec;

    if (spec.group === 'void') {
      return {
        id: generateId(),
        kind: 'element',
        type: spec.name,
        attrs: match.attrs,
        children: [],
      };
    }

    // Check if this is a container block (like lists)
    const childElements = Array.from(el.children).filter((c) => c.nodeType === 1) as HTMLElement[];
    const hasBlockChildren = childElements.some((c) => {
      const childMatch = matchParseRules(c, specs);
      return childMatch?.type === 'node' && childMatch.spec.group === 'block';
    });

    if (hasBlockChildren) {
      // Parse children as block elements
      const children: EditorNode[] = [];
      for (const child of childElements) {
        const parsed = parseElement(child, specs);
        if (parsed) children.push(parsed);
      }
      return {
        id: generateId(),
        kind: 'element',
        type: spec.name,
        attrs: match.attrs,
        children,
      };
    }

    // Inline content
    const textNodes = parseInlineContent(el, specs, []);
    const children: EditorNode[] = textNodes.length > 0
      ? textNodes
      : [{ id: generateId(), kind: 'text' as const, text: '', marks: [] }];

    return {
      id: generateId(),
      kind: 'element',
      type: spec.name,
      attrs: match.attrs,
      children,
    };
  }

  return null;
}

export function fromHTML(html: string, specs: ImportSpecs): Document {
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');

  const nodeTypeMap = new Map(specs.nodeTypes.map((s) => [s.name, s]));
  const markTypeMap = new Map(specs.markTypes.map((s) => [s.name, s]));
  const specMaps = { nodeTypes: nodeTypeMap, markTypes: markTypeMap };

  const children: ElementNode[] = [];

  for (const child of Array.from(dom.body.childNodes)) {
    if (child.nodeType === 1) {
      const el = child as HTMLElement;
      const parsed = parseElement(el, specMaps);
      if (parsed) {
        children.push(parsed);
      } else {
        // Fallback: wrap in paragraph
        const textNodes = parseInlineContent(el, specMaps, []);
        if (textNodes.length > 0) {
          children.push({
            id: generateId(),
            kind: 'element',
            type: 'paragraph',
            attrs: {},
            children: textNodes,
          });
        }
      }
    } else if (child.nodeType === 3) {
      const text = (child.textContent ?? '').trim();
      if (text) {
        children.push({
          id: generateId(),
          kind: 'element',
          type: 'paragraph',
          attrs: {},
          children: [{ id: generateId(), kind: 'text', text, marks: [] }],
        });
      }
    }
  }

  if (children.length === 0) {
    children.push({
      id: generateId(),
      kind: 'element',
      type: 'paragraph',
      attrs: {},
      children: [{ id: generateId(), kind: 'text', text: '', marks: [] }],
    });
  }

  return {
    id: generateId(),
    kind: 'document',
    children,
    version: 0,
  };
}
