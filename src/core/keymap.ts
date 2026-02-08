import type { KeymapRegistryInterface, CommandRegistryInterface } from './types';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

interface ParsedShortcut {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split('-');
  const key = parts.pop()!.toLowerCase();
  const modifiers = new Set(parts.map((p) => p.toLowerCase()));

  let ctrl = modifiers.has('ctrl');
  let meta = modifiers.has('meta');
  const shift = modifiers.has('shift');
  const alt = modifiers.has('alt');

  // "Mod" = Cmd on Mac, Ctrl on other platforms
  if (modifiers.has('mod')) {
    if (IS_MAC) {
      meta = true;
    } else {
      ctrl = true;
    }
  }

  return { ctrl, meta, shift, alt, key };
}

function matchesEvent(parsed: ParsedShortcut, event: KeyboardEvent): boolean {
  return (
    parsed.ctrl === event.ctrlKey &&
    parsed.meta === event.metaKey &&
    parsed.shift === event.shiftKey &&
    parsed.alt === event.altKey &&
    parsed.key === event.key.toLowerCase()
  );
}

function normalizeShortcut(shortcut: string): string {
  const parsed = parseShortcut(shortcut);
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.meta) parts.push('Meta');
  if (parsed.shift) parts.push('Shift');
  if (parsed.alt) parts.push('Alt');
  parts.push(parsed.key);
  return parts.join('-');
}

export class KeymapRegistry implements KeymapRegistryInterface {
  private bindings: Map<string, { parsed: ParsedShortcut; commandName: string }> = new Map();
  private commands: CommandRegistryInterface | null = null;

  setCommands(commands: CommandRegistryInterface): void {
    this.commands = commands;
  }

  register(shortcut: string, commandName: string): void {
    const key = normalizeShortcut(shortcut);
    this.bindings.set(key, { parsed: parseShortcut(shortcut), commandName });
  }

  unregister(shortcut: string): void {
    const key = normalizeShortcut(shortcut);
    this.bindings.delete(key);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.commands) return false;

    for (const [, binding] of this.bindings) {
      if (matchesEvent(binding.parsed, event)) {
        const result = this.commands.execute(binding.commandName);
        if (result) {
          event.preventDefault();
          return true;
        }
      }
    }
    return false;
  }

  getAll(): ReadonlyMap<string, string> {
    const result = new Map<string, string>();
    for (const [key, binding] of this.bindings) {
      result.set(key, binding.commandName);
    }
    return result;
  }
}
