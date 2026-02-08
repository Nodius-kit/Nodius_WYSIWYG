import type { NodeTypeSpec, MarkTypeSpec } from './types';

export class Schema {
  private nodeTypes: Map<string, NodeTypeSpec> = new Map();
  private markTypes: Map<string, MarkTypeSpec> = new Map();

  constructor(nodeTypes: NodeTypeSpec[] = [], markTypes: MarkTypeSpec[] = []) {
    for (const spec of nodeTypes) {
      if (this.nodeTypes.has(spec.name)) {
        throw new Error(`Duplicate node type: "${spec.name}"`);
      }
      this.nodeTypes.set(spec.name, spec);
    }
    for (const spec of markTypes) {
      if (this.markTypes.has(spec.name)) {
        throw new Error(`Duplicate mark type: "${spec.name}"`);
      }
      this.markTypes.set(spec.name, spec);
    }
  }

  getNodeType(name: string): NodeTypeSpec | undefined {
    return this.nodeTypes.get(name);
  }

  getMarkType(name: string): MarkTypeSpec | undefined {
    return this.markTypes.get(name);
  }

  hasNodeType(name: string): boolean {
    return this.nodeTypes.has(name);
  }

  hasMarkType(name: string): boolean {
    return this.markTypes.has(name);
  }

  getAllNodeTypes(): NodeTypeSpec[] {
    return Array.from(this.nodeTypes.values());
  }

  getAllMarkTypes(): MarkTypeSpec[] {
    return Array.from(this.markTypes.values());
  }
}

// Default node types that are always available
export const paragraphNodeType: NodeTypeSpec = {
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  toDOM: () => ['p', {}],
  parseDOM: [{ tag: 'p' }],
};

export const documentNodeType: NodeTypeSpec = {
  name: 'document',
  group: 'block',
  content: 'block+',
  toDOM: () => ['div', {}],
};
