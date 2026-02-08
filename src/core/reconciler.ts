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

export class Reconciler {
  private nodeTypeSpecs: Map<string, NodeTypeSpec> = new Map();
  private markTypeSpecs: Map<string, MarkTypeSpec> = new Map();

  setSpecs(nodeTypes: NodeTypeSpec[], markTypes: MarkTypeSpec[]): void {
    this.nodeTypeSpecs.clear();
    this.markTypeSpecs.clear();
    for (const spec of nodeTypes) this.nodeTypeSpecs.set(spec.name, spec);
    for (const spec of markTypes) this.markTypeSpecs.set(spec.name, spec);
  }

  renderToDOM(doc: Document, container: HTMLElement): void {
    container.innerHTML = '';
    for (const block of doc.children) {
      container.appendChild(this.renderBlock(block));
    }
  }

  reconcile(prevDoc: Document, nextDoc: Document, container: HTMLElement): void {
    this.diffChildren(prevDoc.children, nextDoc.children, container);
  }

  // ─── Block Rendering ───────────────────────────────────

  private renderBlock(node: ElementNode): HTMLElement {
    const spec = this.nodeTypeSpecs.get(node.type);
    let el: HTMLElement;

    if (spec) {
      el = this.buildElement(spec.toDOM(node));
    } else {
      // Default: render as div
      el = document.createElement('div');
    }

    el.setAttribute('data-node-id', node.id);
    el.setAttribute('data-node-type', node.type);

    // Check if void block
    if (spec?.group === 'void') {
      el.setAttribute('contenteditable', 'false');
      // Apply attrs directly
      this.applyNodeAttrs(el, node);
      return el;
    }

    // Render children (inline content)
    for (const child of node.children) {
      const childEl = this.renderInline(child);
      if (childEl) el.appendChild(childEl);
    }

    return el;
  }

  private renderInline(node: EditorNode): Node | null {
    if (isTextNode(node)) {
      return this.renderText(node);
    }
    if (isElementNode(node)) {
      // Nested element (like list_item containing paragraphs)
      return this.renderBlock(node);
    }
    return null;
  }

  private renderText(node: TextNode): Node {
    if (node.marks.length === 0) {
      const textEl = document.createTextNode(node.text);
      return textEl;
    }
    return this.applyMarks(node.text, node.marks);
  }

  private applyMarks(text: string, marks: readonly Mark[]): Node {
    let current: Node = document.createTextNode(text);

    for (const mark of marks) {
      const spec = this.markTypeSpecs.get(mark.type);
      let wrapper: HTMLElement;

      if (spec) {
        wrapper = this.buildElement(spec.toDOM(mark));
      } else {
        // Default mark rendering
        wrapper = this.getDefaultMarkElement(mark.type);
      }

      wrapper.appendChild(current);
      current = wrapper;
    }

    return current;
  }

  private getDefaultMarkElement(markType: string): HTMLElement {
    switch (markType) {
      case 'bold': return document.createElement('strong');
      case 'italic': return document.createElement('em');
      case 'underline': {
        const el = document.createElement('span');
        el.style.textDecoration = 'underline';
        return el;
      }
      default: return document.createElement('span');
    }
  }

  private applyNodeAttrs(el: HTMLElement, node: ElementNode): void {
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value != null) {
        el.setAttribute(`data-${key}`, String(value));
      }
    }
  }

  // ─── DOM Builder from DOMOutputSpec ─────────────────────

  private buildElement(spec: DOMOutputSpec): HTMLElement {
    if (typeof spec === 'string') {
      return document.createElement(spec);
    }

    const [tag, ...rest] = spec as [string, ...unknown[]];
    const el = document.createElement(tag);

    let childStartIndex = 0;
    if (rest.length > 0 && rest[0] !== null && typeof rest[0] === 'object' && !Array.isArray(rest[0]) && rest[0] !== 0) {
      // First item is attributes
      const attrs = rest[0] as Record<string, string>;
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'style') {
          el.setAttribute('style', value);
        } else if (key === 'class') {
          el.className = value;
        } else {
          el.setAttribute(key, value);
        }
      }
      childStartIndex = 1;
    }

    // Process remaining items as children
    for (let i = childStartIndex; i < rest.length; i++) {
      const child = rest[i];
      if (child === 0) {
        // "hole" — content goes here, handled by caller
        continue;
      }
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (Array.isArray(child)) {
        el.appendChild(this.buildElement(child as DOMOutputSpec));
      }
    }

    return el;
  }

  // ─── Diff / Reconciliation ─────────────────────────────

  private diffChildren(
    prevChildren: readonly ElementNode[],
    nextChildren: readonly ElementNode[],
    container: HTMLElement,
  ): void {
    // Build map of existing DOM elements by node ID
    const existingMap = new Map<string, HTMLElement>();
    for (const child of Array.from(container.children)) {
      const id = (child as HTMLElement).getAttribute('data-node-id');
      if (id) existingMap.set(id, child as HTMLElement);
    }

    const nextIds = new Set(nextChildren.map((c) => c.id));

    // Remove elements that no longer exist
    for (const [id, el] of existingMap) {
      if (!nextIds.has(id)) {
        container.removeChild(el);
        existingMap.delete(id);
      }
    }

    // Walk next children and reconcile
    let refNode: Node | null = container.firstChild;
    for (let i = 0; i < nextChildren.length; i++) {
      const nextChild = nextChildren[i];
      const prevChild = prevChildren.find((c) => c.id === nextChild.id);
      const existingEl = existingMap.get(nextChild.id);

      if (existingEl) {
        // Element exists — check if it needs updating
        if (prevChild && this.blockChanged(prevChild, nextChild)) {
          // Re-render the block
          const newEl = this.renderBlock(nextChild);
          container.replaceChild(newEl, existingEl);
          refNode = newEl.nextSibling;
        } else if (existingEl !== refNode) {
          // Needs repositioning
          container.insertBefore(existingEl, refNode);
          // refNode stays the same (existingEl was moved before it)
        } else {
          refNode = existingEl.nextSibling;
        }
      } else {
        // New element — render and insert
        const newEl = this.renderBlock(nextChild);
        container.insertBefore(newEl, refNode);
        // refNode stays the same
      }
    }
  }

  private blockChanged(prev: ElementNode, next: ElementNode): boolean {
    if (prev.type !== next.type) return true;
    if (JSON.stringify(prev.attrs) !== JSON.stringify(next.attrs)) return true;
    if (prev.children.length !== next.children.length) return true;

    for (let i = 0; i < prev.children.length; i++) {
      if (this.nodeChanged(prev.children[i], next.children[i])) return true;
    }

    return false;
  }

  private nodeChanged(prev: EditorNode, next: EditorNode): boolean {
    if (prev.kind !== next.kind) return true;

    if (isTextNode(prev) && isTextNode(next)) {
      return prev.text !== next.text || JSON.stringify(prev.marks) !== JSON.stringify(next.marks);
    }

    if (isElementNode(prev) && isElementNode(next)) {
      return this.blockChanged(prev, next);
    }

    return true;
  }
}
