import type { EditorEvents, EventBusInterface } from './types';

export class EventBus implements EventBusInterface {
  private handlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private destroyed = false;

  on<K extends keyof EditorEvents>(
    event: K,
    handler: (data: EditorEvents[K]) => void,
  ): () => void {
    if (this.destroyed) return () => {};

    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(handler as (data: unknown) => void);

    return () => this.off(event, handler);
  }

  off<K extends keyof EditorEvents>(
    event: K,
    handler: (data: EditorEvents[K]) => void,
  ): void {
    const set = this.handlers.get(event as string);
    if (set) {
      set.delete(handler as (data: unknown) => void);
      if (set.size === 0) {
        this.handlers.delete(event as string);
      }
    }
  }

  emit<K extends keyof EditorEvents>(event: K, data: EditorEvents[K]): void {
    if (this.destroyed) return;
    const set = this.handlers.get(event as string);
    if (set) {
      for (const handler of set) {
        handler(data);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
  }
}
