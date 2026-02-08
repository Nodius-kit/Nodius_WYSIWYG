import type {
  PluginDefinition,
  PluginInstance,
  PluginContext,
  Transaction,
  ContentState,
  NodeTypeSpec,
  MarkTypeSpec,
  ToolbarItemSpec,
} from './types';

export class PluginRegistry {
  private plugins: Map<string, PluginDefinition> = new Map();
  private instances: Map<string, PluginInstance | void> = new Map();
  private initOrder: string[] = [];
  private initialized = false;

  register(plugin: PluginDefinition): void {
    if (this.initialized) throw new Error(`Cannot register plugin "${plugin.name}" after initialization`);
    if (this.plugins.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" already registered`);
    this.plugins.set(plugin.name, plugin);
  }

  registerAll(plugins: PluginDefinition[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  initAll(ctx: PluginContext): void {
    if (this.initialized) throw new Error('Plugins already initialized');

    this.initOrder = this.topologicalSort();
    this.initialized = true;

    for (const name of this.initOrder) {
      const plugin = this.plugins.get(name)!;
      if (plugin.init) {
        const instance = plugin.init(ctx);
        this.instances.set(name, instance ?? undefined);
      }
    }
  }

  destroyAll(): void {
    // Destroy in reverse order
    for (let i = this.initOrder.length - 1; i >= 0; i--) {
      const name = this.initOrder[i];
      const instance = this.instances.get(name);
      if (instance && instance.destroy) {
        instance.destroy();
      }
      const plugin = this.plugins.get(name);
      if (plugin?.destroy) {
        plugin.destroy();
      }
    }
    this.instances.clear();
    this.initialized = false;
  }

  get(name: string): PluginDefinition | undefined {
    return this.plugins.get(name);
  }

  getAll(): PluginDefinition[] {
    return this.initOrder.map((name) => this.plugins.get(name)!);
  }

  getInitOrder(): string[] {
    return [...this.initOrder];
  }

  // ─── Hook Dispatch ──────────────────────────────────────

  runOnTransaction(tr: Transaction, state: ContentState): Transaction | null {
    let current: Transaction | null = tr;

    for (const name of this.initOrder) {
      if (current === null) return null;
      const plugin = this.plugins.get(name)!;
      if (plugin.onTransaction) {
        const result = plugin.onTransaction(current, state);
        if (result === null) return null; // Rejected
        if (result !== undefined) current = result; // Replaced
        // undefined = passthrough
      }
    }

    return current;
  }

  runOnUpdate(prevState: ContentState, nextState: ContentState): void {
    for (const name of this.initOrder) {
      const plugin = this.plugins.get(name)!;
      if (plugin.onUpdate) {
        plugin.onUpdate(prevState, nextState);
      }
    }
  }

  runOnKeyDown(event: KeyboardEvent, ctx: PluginContext): boolean {
    for (const name of this.initOrder) {
      const plugin = this.plugins.get(name)!;
      if (plugin.onKeyDown) {
        if (plugin.onKeyDown(event, ctx)) return true;
      }
    }
    return false;
  }

  // ─── Schema Aggregation ─────────────────────────────────

  getAllNodeTypes(): NodeTypeSpec[] {
    const result: NodeTypeSpec[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.nodeTypes) {
        result.push(...plugin.nodeTypes);
      }
    }
    return result;
  }

  getAllMarkTypes(): MarkTypeSpec[] {
    const result: MarkTypeSpec[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.markTypes) {
        result.push(...plugin.markTypes);
      }
    }
    return result;
  }

  getAllToolbarItems(): ToolbarItemSpec[] {
    const result: ToolbarItemSpec[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.toolbarItems) {
        result.push(...plugin.toolbarItems);
      }
    }
    return result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // ─── Topological Sort (Kahn's Algorithm) ────────────────

  private topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const name of this.plugins.keys()) {
      inDegree.set(name, 0);
      adjacency.set(name, []);
    }

    // Build graph
    for (const [name, plugin] of this.plugins) {
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          if (!this.plugins.has(dep)) {
            throw new Error(`Plugin "${name}" depends on unknown plugin "${dep}"`);
          }
          adjacency.get(dep)!.push(name);
          inDegree.set(name, inDegree.get(name)! + 1);
        }
      }
    }

    // Queue of nodes with in-degree 0
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const neighbor of adjacency.get(node)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (result.length !== this.plugins.size) {
      throw new Error('Circular dependency detected among plugins');
    }

    return result;
  }
}
