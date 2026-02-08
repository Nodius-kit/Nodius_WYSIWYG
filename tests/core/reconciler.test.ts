import { describe, it, expect } from 'vitest';
import { Reconciler } from '../../src/core/reconciler';
import type { NodeTypeSpec, MarkTypeSpec, Document, ElementNode, TextNode } from '../../src/core/types';
import { generateId } from '../../src/core/types';
import { createDocWith } from '../helpers';

const paragraphSpec: NodeTypeSpec = {
  name: 'paragraph', group: 'block', toDOM: () => ['p', {}],
};

const headingSpec: NodeTypeSpec = {
  name: 'heading', group: 'block',
  toDOM: (node) => [`h${node.attrs.level ?? 1}` as string, {}],
};

const imageSpec: NodeTypeSpec = {
  name: 'image', group: 'void',
  toDOM: (node) => ['img', { src: String(node.attrs.src ?? '') }],
};

const boldSpec: MarkTypeSpec = {
  name: 'bold', toDOM: () => ['strong', {}],
};

const italicSpec: MarkTypeSpec = {
  name: 'italic', toDOM: () => ['em', {}],
};

function createReconciler(): Reconciler {
  const r = new Reconciler();
  r.setSpecs([paragraphSpec, headingSpec, imageSpec], [boldSpec, italicSpec]);
  return r;
}

describe('Reconciler', () => {
  describe('renderToDOM', () => {
    it('should render empty document', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{ type: 'paragraph', text: '' }]);
      r.renderToDOM(doc, container);
      expect(container.children).toHaveLength(1);
      expect(container.children[0].tagName).toBe('P');
    });

    it('should render paragraph with text', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{ type: 'paragraph', text: 'Hello World' }]);
      r.renderToDOM(doc, container);
      expect(container.textContent).toBe('Hello World');
    });

    it('should render heading with correct level', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{ type: 'heading', text: 'Title', attrs: { level: 2 } }]);
      r.renderToDOM(doc, container);
      expect(container.children[0].tagName).toBe('H2');
    });

    it('should render text with bold mark', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{
        type: 'paragraph', text: 'Bold', marks: [{ type: 'bold' }],
      }]);
      r.renderToDOM(doc, container);
      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong!.textContent).toBe('Bold');
    });

    it('should render text with nested marks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{
        type: 'paragraph', text: 'Both',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      }]);
      r.renderToDOM(doc, container);
      const em = container.querySelector('em');
      const strong = container.querySelector('strong');
      expect(em).not.toBeNull();
      expect(strong).not.toBeNull();
    });

    it('should render void blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc: Document = {
        id: generateId(), kind: 'document', version: 0,
        children: [{
          id: generateId(), kind: 'element', type: 'image',
          attrs: { src: 'test.png' }, children: [],
        }],
      };
      r.renderToDOM(doc, container);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('test.png');
      expect(img!.getAttribute('contenteditable')).toBe('false');
    });

    it('should set data-node-id on each block', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([{ type: 'paragraph', text: 'A' }, { type: 'paragraph', text: 'B' }]);
      r.renderToDOM(doc, container);
      for (const child of Array.from(container.children)) {
        expect(child.getAttribute('data-node-id')).toBeTruthy();
      }
    });

    it('should render multiple blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const doc = createDocWith([
        { type: 'paragraph', text: 'First' },
        { type: 'paragraph', text: 'Second' },
        { type: 'paragraph', text: 'Third' },
      ]);
      r.renderToDOM(doc, container);
      expect(container.children).toHaveLength(3);
    });
  });

  describe('reconcile', () => {
    it('should add new blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const prev = createDocWith([{ type: 'paragraph', text: 'First' }]);
      r.renderToDOM(prev, container);

      const next: Document = {
        ...prev,
        children: [
          prev.children[0],
          { id: generateId(), kind: 'element', type: 'paragraph', attrs: {}, children: [{ id: generateId(), kind: 'text', text: 'Second', marks: [] }] },
        ],
      };
      r.reconcile(prev, next, container);
      expect(container.children).toHaveLength(2);
      expect(container.textContent).toContain('Second');
    });

    it('should remove deleted blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const prev = createDocWith([{ type: 'paragraph', text: 'First' }, { type: 'paragraph', text: 'Second' }]);
      r.renderToDOM(prev, container);

      const next: Document = { ...prev, children: [prev.children[0]] };
      r.reconcile(prev, next, container);
      expect(container.children).toHaveLength(1);
      expect(container.textContent).toBe('First');
    });

    it('should update changed blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const prev = createDocWith([{ type: 'paragraph', text: 'Old' }]);
      r.renderToDOM(prev, container);

      const next: Document = {
        ...prev,
        children: [{
          ...prev.children[0],
          children: [{ id: generateId(), kind: 'text', text: 'New', marks: [] }],
        }],
      };
      r.reconcile(prev, next, container);
      expect(container.textContent).toBe('New');
    });

    it('should preserve unchanged blocks (same DOM element)', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const prev = createDocWith([{ type: 'paragraph', text: 'Stable' }]);
      r.renderToDOM(prev, container);
      const originalEl = container.children[0];

      r.reconcile(prev, prev, container);
      expect(container.children[0]).toBe(originalEl);
    });

    it('should reorder blocks', () => {
      const r = createReconciler();
      const container = document.createElement('div');
      const prev = createDocWith([{ type: 'paragraph', text: 'A' }, { type: 'paragraph', text: 'B' }]);
      r.renderToDOM(prev, container);

      const next: Document = {
        ...prev,
        children: [prev.children[1], prev.children[0]],
      };
      r.reconcile(prev, next, container);
      expect(container.children[0].textContent).toBe('B');
      expect(container.children[1].textContent).toBe('A');
    });
  });
});
