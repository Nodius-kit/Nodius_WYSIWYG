import type {
  Document,
  EditorNode,
  ElementNode,
  TextNode,
  Mark,
  NodeTypeSpec,
  MarkTypeSpec,
  DOMOutputSpec,
} from './types';
import { isTextNode, isElementNode } from './types';

// ─── JSON Export ──────────────────────────────────────────────

export function toJSON(doc: Document): string {
  return JSON.stringify(doc);
}

// ─── HTML Export ──────────────────────────────────────────────

interface ExportSpecs {
  nodeTypes: readonly NodeTypeSpec[];
  markTypes: readonly MarkTypeSpec[];
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function domSpecToHTML(spec: DOMOutputSpec, content: string): string {
  if (typeof spec === 'string') return spec;

  const [tag, ...rest] = spec;
  let attrs: Record<string, string> = {};
  let children: (DOMOutputSpec | 0)[] = [];

  if (rest.length > 0 && typeof rest[0] === 'object' && !Array.isArray(rest[0]) && rest[0] !== null) {
    attrs = rest[0] as Record<string, string>;
    children = rest.slice(1) as (DOMOutputSpec | 0)[];
  } else {
    children = rest as (DOMOutputSpec | 0)[];
  }

  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeHTML(String(v))}"`)
    .join('');

  const voidTags = ['img', 'br', 'hr', 'input'];
  if (voidTags.includes(tag)) {
    return `<${tag}${attrStr} />`;
  }

  if (children.length === 0) {
    return `<${tag}${attrStr}>${content}</${tag}>`;
  }

  let inner = '';
  for (const child of children) {
    if (child === 0) {
      inner += content;
    } else {
      inner += domSpecToHTML(child, content);
    }
  }

  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

function textNodeToHTML(node: TextNode, markSpecs: Map<string, MarkTypeSpec>): string {
  let html = escapeHTML(node.text);

  for (const mark of node.marks) {
    const spec = markSpecs.get(mark.type);
    if (spec) {
      const domSpec = spec.toDOM(mark);
      html = domSpecToHTML(domSpec, html);
    } else {
      // Fallback for unknown marks
      html = `<span data-mark="${escapeHTML(mark.type)}">${html}</span>`;
    }
  }

  return html;
}

function elementNodeToHTML(
  node: ElementNode,
  nodeSpecs: Map<string, NodeTypeSpec>,
  markSpecs: Map<string, MarkTypeSpec>,
): string {
  const childrenHTML = node.children
    .map((child) => editorNodeToHTML(child, nodeSpecs, markSpecs))
    .join('');

  const spec = nodeSpecs.get(node.type);
  if (spec) {
    const domSpec = spec.toDOM(node);
    return domSpecToHTML(domSpec, childrenHTML);
  }

  // Fallback
  return `<div data-type="${escapeHTML(node.type)}">${childrenHTML}</div>`;
}

function editorNodeToHTML(
  node: EditorNode,
  nodeSpecs: Map<string, NodeTypeSpec>,
  markSpecs: Map<string, MarkTypeSpec>,
): string {
  if (isTextNode(node)) return textNodeToHTML(node, markSpecs);
  if (isElementNode(node)) return elementNodeToHTML(node, nodeSpecs, markSpecs);
  return '';
}

export function toHTML(doc: Document, specs: ExportSpecs): string {
  const nodeSpecs = new Map(specs.nodeTypes.map((s) => [s.name, s]));
  const markSpecs = new Map(specs.markTypes.map((s) => [s.name, s]));

  return doc.children
    .map((child) => elementNodeToHTML(child, nodeSpecs, markSpecs))
    .join('\n');
}

// ─── Markdown Export ──────────────────────────────────────────

function textNodeToMarkdown(node: TextNode): string {
  let text = node.text;

  const hasBold = node.marks.some((m) => m.type === 'bold');
  const hasItalic = node.marks.some((m) => m.type === 'italic');
  const hasUnderline = node.marks.some((m) => m.type === 'underline');

  if (hasBold) text = `**${text}**`;
  if (hasItalic) text = `*${text}*`;
  if (hasUnderline) text = `<u>${text}</u>`;

  return text;
}

function elementChildrenToMarkdown(node: ElementNode): string {
  return node.children
    .map((child) => {
      if (isTextNode(child)) return textNodeToMarkdown(child);
      if (isElementNode(child)) return elementToMarkdown(child);
      return '';
    })
    .join('');
}

function elementToMarkdown(node: ElementNode, depth: number = 0): string {
  switch (node.type) {
    case 'paragraph':
      return elementChildrenToMarkdown(node);

    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
      return '#'.repeat(level) + ' ' + elementChildrenToMarkdown(node);
    }

    case 'ordered_list':
      return node.children
        .map((item, i) => {
          if (isElementNode(item) && item.type === 'list_item') {
            const content = item.children
              .map((c) => isElementNode(c) ? elementChildrenToMarkdown(c) : '')
              .join('');
            return `${i + 1}. ${content}`;
          }
          return '';
        })
        .join('\n');

    case 'unordered_list':
      return node.children
        .map((item) => {
          if (isElementNode(item) && item.type === 'list_item') {
            const content = item.children
              .map((c) => isElementNode(c) ? elementChildrenToMarkdown(c) : '')
              .join('');
            return `- ${content}`;
          }
          return '';
        })
        .join('\n');

    case 'image': {
      const alt = String(node.attrs.alt ?? '');
      const src = String(node.attrs.src ?? '');
      return `![${alt}](${src})`;
    }

    default:
      return elementChildrenToMarkdown(node);
  }
}

export function toMarkdown(doc: Document): string {
  return doc.children
    .map((child) => elementToMarkdown(child))
    .join('\n\n');
}
