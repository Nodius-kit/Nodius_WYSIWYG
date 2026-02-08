import { describe, it, expect } from 'vitest';
import { Schema, paragraphNodeType } from '../../src/core/schema';
import type { NodeTypeSpec, MarkTypeSpec } from '../../src/core/types';

describe('Schema', () => {
  it('should store node types', () => {
    const schema = new Schema([paragraphNodeType]);
    expect(schema.hasNodeType('paragraph')).toBe(true);
    expect(schema.getNodeType('paragraph')).toEqual(paragraphNodeType);
  });

  it('should store mark types', () => {
    const boldMark: MarkTypeSpec = { name: 'bold', toDOM: () => ['strong', {}] };
    const schema = new Schema([], [boldMark]);
    expect(schema.hasMarkType('bold')).toBe(true);
    expect(schema.getMarkType('bold')).toEqual(boldMark);
  });

  it('should throw on duplicate node types', () => {
    expect(() => new Schema([paragraphNodeType, paragraphNodeType])).toThrow('Duplicate node type');
  });

  it('should throw on duplicate mark types', () => {
    const bold: MarkTypeSpec = { name: 'bold', toDOM: () => ['strong', {}] };
    expect(() => new Schema([], [bold, bold])).toThrow('Duplicate mark type');
  });

  it('should return undefined for unknown types', () => {
    const schema = new Schema();
    expect(schema.getNodeType('nonexistent')).toBeUndefined();
    expect(schema.getMarkType('nonexistent')).toBeUndefined();
  });

  it('should return false for unknown type checks', () => {
    const schema = new Schema();
    expect(schema.hasNodeType('nonexistent')).toBe(false);
    expect(schema.hasMarkType('nonexistent')).toBe(false);
  });

  it('should return all node types', () => {
    const heading: NodeTypeSpec = { name: 'heading', group: 'block', toDOM: () => ['h1', {}] };
    const schema = new Schema([paragraphNodeType, heading]);
    expect(schema.getAllNodeTypes()).toHaveLength(2);
  });

  it('should return all mark types', () => {
    const bold: MarkTypeSpec = { name: 'bold', toDOM: () => ['strong', {}] };
    const italic: MarkTypeSpec = { name: 'italic', toDOM: () => ['em', {}] };
    const schema = new Schema([], [bold, italic]);
    expect(schema.getAllMarkTypes()).toHaveLength(2);
  });
});
