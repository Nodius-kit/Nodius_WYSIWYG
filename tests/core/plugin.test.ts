import { describe, it, expect, vi } from 'vitest';
import { PluginRegistry } from '../../src/core/plugin';
import type { PluginDefinition, PluginContext, Transaction, ContentState } from '../../src/core/types';

function mockCtx(): PluginContext {
  return {
    editor: {} as any,
    commands: { register: vi.fn(), execute: vi.fn(), has: vi.fn(), getAll: vi.fn() },
    keymap: { register: vi.fn(), unregister: vi.fn(), handleKeyDown: vi.fn(), getAll: vi.fn() },
  };
}

function createPlugin(name: string, opts: Partial<PluginDefinition> = {}): PluginDefinition {
  return { name, ...opts };
}

describe('PluginRegistry', () => {
  describe('registration', () => {
    it('should register a plugin', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('bold'));
      expect(registry.get('bold')).toBeDefined();
    });

    it('should throw on duplicate registration', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('bold'));
      expect(() => registry.register(createPlugin('bold'))).toThrow('already registered');
    });

    it('should throw when registering after init', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('a'));
      registry.initAll(mockCtx());
      expect(() => registry.register(createPlugin('b'))).toThrow('after initialization');
    });

    it('should register multiple plugins via registerAll', () => {
      const registry = new PluginRegistry();
      registry.registerAll([createPlugin('a'), createPlugin('b'), createPlugin('c')]);
      expect(registry.get('a')).toBeDefined();
      expect(registry.get('b')).toBeDefined();
      expect(registry.get('c')).toBeDefined();
    });
  });

  describe('topological sort', () => {
    it('should init plugins with no deps in registration order', () => {
      const registry = new PluginRegistry();
      registry.registerAll([createPlugin('a'), createPlugin('b'), createPlugin('c')]);
      registry.initAll(mockCtx());
      expect(registry.getInitOrder()).toEqual(['a', 'b', 'c']);
    });

    it('should resolve linear dependency chain', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('c', { dependencies: ['b'] }));
      registry.register(createPlugin('b', { dependencies: ['a'] }));
      registry.register(createPlugin('a'));
      registry.initAll(mockCtx());
      const order = registry.getInitOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('should resolve diamond dependency', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('d', { dependencies: ['b', 'c'] }));
      registry.register(createPlugin('b', { dependencies: ['a'] }));
      registry.register(createPlugin('c', { dependencies: ['a'] }));
      registry.register(createPlugin('a'));
      registry.initAll(mockCtx());
      const order = registry.getInitOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });

    it('should throw on circular dependency', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('a', { dependencies: ['b'] }));
      registry.register(createPlugin('b', { dependencies: ['a'] }));
      expect(() => registry.initAll(mockCtx())).toThrow('Circular dependency');
    });

    it('should throw on unknown dependency', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('a', { dependencies: ['nonexistent'] }));
      expect(() => registry.initAll(mockCtx())).toThrow('unknown plugin');
    });
  });

  describe('lifecycle', () => {
    it('should call init() on each plugin', () => {
      const initFn = vi.fn();
      const registry = new PluginRegistry();
      registry.register(createPlugin('a', { init: initFn }));
      const ctx = mockCtx();
      registry.initAll(ctx);
      expect(initFn).toHaveBeenCalledWith(ctx);
    });

    it('should call destroy() in reverse order', () => {
      const order: string[] = [];
      const registry = new PluginRegistry();
      registry.register(createPlugin('a', { destroy: () => order.push('a') }));
      registry.register(createPlugin('b', { dependencies: ['a'], destroy: () => order.push('b') }));
      registry.initAll(mockCtx());
      registry.destroyAll();
      expect(order).toEqual(['b', 'a']);
    });

    it('should call PluginInstance.destroy()', () => {
      const instanceDestroy = vi.fn();
      const registry = new PluginRegistry();
      registry.register(createPlugin('a', {
        init: () => ({ destroy: instanceDestroy }),
      }));
      registry.initAll(mockCtx());
      registry.destroyAll();
      expect(instanceDestroy).toHaveBeenCalled();
    });

    it('should throw if initAll called twice', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('a'));
      registry.initAll(mockCtx());
      expect(() => registry.initAll(mockCtx())).toThrow('already initialized');
    });
  });

  describe('hooks', () => {
    it('runOnTransaction should pass transaction through plugins', () => {
      const registry = new PluginRegistry();
      const tr: Transaction = { operations: [], origin: 'test', timestamp: 0 };
      const state: ContentState = { doc: {} as any, selection: null };

      registry.register(createPlugin('a', {
        onTransaction: (t) => ({ ...t, origin: 'modified' }),
      }));
      registry.initAll(mockCtx());

      const result = registry.runOnTransaction(tr, state);
      expect(result).not.toBeNull();
      expect(result!.origin).toBe('modified');
    });

    it('runOnTransaction should reject when plugin returns null', () => {
      const registry = new PluginRegistry();
      const tr: Transaction = { operations: [], origin: 'test', timestamp: 0 };
      const state: ContentState = { doc: {} as any, selection: null };

      registry.register(createPlugin('a', {
        onTransaction: () => null,
      }));
      registry.initAll(mockCtx());

      expect(registry.runOnTransaction(tr, state)).toBeNull();
    });

    it('runOnTransaction should passthrough when plugin returns undefined', () => {
      const registry = new PluginRegistry();
      const tr: Transaction = { operations: [], origin: 'test', timestamp: 0 };
      const state: ContentState = { doc: {} as any, selection: null };

      registry.register(createPlugin('a', {
        onTransaction: () => undefined,
      }));
      registry.initAll(mockCtx());

      expect(registry.runOnTransaction(tr, state)).toEqual(tr);
    });

    it('runOnTransaction should stop pipeline on rejection', () => {
      const registry = new PluginRegistry();
      const secondPlugin = vi.fn();
      const tr: Transaction = { operations: [], origin: 'test', timestamp: 0 };
      const state: ContentState = { doc: {} as any, selection: null };

      registry.register(createPlugin('a', { onTransaction: () => null }));
      registry.register(createPlugin('b', { dependencies: ['a'], onTransaction: secondPlugin }));
      registry.initAll(mockCtx());

      registry.runOnTransaction(tr, state);
      expect(secondPlugin).not.toHaveBeenCalled();
    });

    it('runOnUpdate should call all plugins', () => {
      const registry = new PluginRegistry();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const state: ContentState = { doc: {} as any, selection: null };

      registry.register(createPlugin('a', { onUpdate: fn1 }));
      registry.register(createPlugin('b', { onUpdate: fn2 }));
      registry.initAll(mockCtx());

      registry.runOnUpdate(state, state);
      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });

    it('runOnKeyDown should stop on first handler returning true', () => {
      const registry = new PluginRegistry();
      const fn2 = vi.fn();
      const ctx = mockCtx();

      registry.register(createPlugin('a', { onKeyDown: () => true }));
      registry.register(createPlugin('b', { onKeyDown: fn2 }));
      registry.initAll(ctx);

      const event = new KeyboardEvent('keydown');
      const handled = registry.runOnKeyDown(event, ctx);

      expect(handled).toBe(true);
      expect(fn2).not.toHaveBeenCalled();
    });
  });

  describe('schema aggregation', () => {
    it('should collect node types from all plugins', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('heading', {
        nodeTypes: [{ name: 'heading', group: 'block', toDOM: () => ['h1', {}] }],
      }));
      registry.register(createPlugin('blockquote', {
        nodeTypes: [{ name: 'blockquote', group: 'block', toDOM: () => ['blockquote', {}] }],
      }));

      const types = registry.getAllNodeTypes();
      expect(types).toHaveLength(2);
      expect(types.map((t) => t.name)).toContain('heading');
      expect(types.map((t) => t.name)).toContain('blockquote');
    });

    it('should collect mark types from all plugins', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('bold', {
        markTypes: [{ name: 'bold', toDOM: () => ['strong', {}] }],
      }));

      const types = registry.getAllMarkTypes();
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('bold');
    });

    it('should collect and sort toolbar items', () => {
      const registry = new PluginRegistry();
      registry.register(createPlugin('bold', {
        toolbarItems: [{ name: 'bold', icon: '', title: 'Bold', command: 'toggle-bold', order: 2 }],
      }));
      registry.register(createPlugin('italic', {
        toolbarItems: [{ name: 'italic', icon: '', title: 'Italic', command: 'toggle-italic', order: 1 }],
      }));

      const items = registry.getAllToolbarItems();
      expect(items[0].name).toBe('italic');
      expect(items[1].name).toBe('bold');
    });
  });
});
