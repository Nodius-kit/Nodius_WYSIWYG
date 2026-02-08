import { describe, it, expect, vi } from 'vitest';
import { KeymapRegistry } from '../../src/core/keymap';
import type { CommandRegistryInterface } from '../../src/core/types';

function createMockCommands(executeFn?: (name: string, args?: Record<string, unknown>) => boolean): CommandRegistryInterface {
  return {
    register: vi.fn(),
    execute: executeFn ?? vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(true),
    getAll: vi.fn().mockReturnValue(new Map()),
  };
}

function createKeyEvent(key: string, opts: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
} = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    cancelable: true,
    bubbles: true,
  });
}

describe('KeymapRegistry', () => {
  it('should register and match a shortcut', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('b', { ctrlKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(true);
    expect(commands.execute).toHaveBeenCalledWith('toggle-bold');
  });

  it('should not match when modifier is wrong', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('b', { altKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(false);
    expect(commands.execute).not.toHaveBeenCalled();
  });

  it('should not match when key is wrong', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('i', { ctrlKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(false);
  });

  it('should handle Shift modifier', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-Shift-z', 'redo');

    const event = createKeyEvent('z', { ctrlKey: true, shiftKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(true);
    expect(commands.execute).toHaveBeenCalledWith('redo');
  });

  it('should handle Alt modifier', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Alt-1', 'set-heading');

    const event = createKeyEvent('1', { altKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(true);
    expect(commands.execute).toHaveBeenCalledWith('set-heading');
  });

  it('should unregister a shortcut', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');
    keymap.unregister('Ctrl-b');

    const event = createKeyEvent('b', { ctrlKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(false);
  });

  it('should return all bindings via getAll()', () => {
    const keymap = new KeymapRegistry();
    keymap.register('Ctrl-b', 'toggle-bold');
    keymap.register('Ctrl-i', 'toggle-italic');

    const all = keymap.getAll();
    expect(all.size).toBe(2);
    expect(all.get('Ctrl-b')).toBe('toggle-bold');
    expect(all.get('Ctrl-i')).toBe('toggle-italic');
  });

  it('should return false when no commands set', () => {
    const keymap = new KeymapRegistry();
    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('b', { ctrlKey: true });
    expect(keymap.handleKeyDown(event)).toBe(false);
  });

  it('should return false when command execution returns false', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands(() => false);
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('b', { ctrlKey: true });
    expect(keymap.handleKeyDown(event)).toBe(false);
  });

  it('should prevent default when command succeeds', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-b', 'toggle-bold');

    const event = createKeyEvent('b', { ctrlKey: true });
    keymap.handleKeyDown(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('should handle case-insensitive key matching', () => {
    const keymap = new KeymapRegistry();
    const commands = createMockCommands();
    keymap.setCommands(commands);

    keymap.register('Ctrl-B', 'toggle-bold');

    const event = createKeyEvent('b', { ctrlKey: true });
    const handled = keymap.handleKeyDown(event);

    expect(handled).toBe(true);
  });
});
