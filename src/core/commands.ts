import type { CommandFn, CommandRegistryInterface, EditorInterface } from './types';

export class CommandRegistry implements CommandRegistryInterface {
  private commands: Map<string, CommandFn> = new Map();
  private editor: EditorInterface | null = null;

  setEditor(editor: EditorInterface): void {
    this.editor = editor;
  }

  register(name: string, fn: CommandFn): void {
    this.commands.set(name, fn);
  }

  execute(name: string, args?: Record<string, unknown>): boolean {
    const fn = this.commands.get(name);
    if (!fn) return false;
    if (!this.editor) return false;
    return fn(this.editor, args);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  getAll(): ReadonlyMap<string, CommandFn> {
    return this.commands;
  }
}
