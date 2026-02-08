import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry } from '../../src/core/commands';
import type { EditorInterface } from '../../src/core/types';

function createMockEditor(): EditorInterface {
  return {
    getState: vi.fn(),
    getDoc: vi.fn(),
    getSelection: vi.fn(),
    dispatch: vi.fn(),
    applyOperations: vi.fn(),
    executeCommand: vi.fn(),
    on: vi.fn(),
    mount: vi.fn(),
    destroy: vi.fn(),
    getEditableElement: vi.fn(),
    getRootElement: vi.fn(),
  } as unknown as EditorInterface;
}

describe('CommandRegistry', () => {
  it('should register and execute a command', () => {
    const registry = new CommandRegistry();
    const editor = createMockEditor();
    registry.setEditor(editor);

    const cmd = vi.fn().mockReturnValue(true);
    registry.register('test-cmd', cmd);

    const result = registry.execute('test-cmd');
    expect(result).toBe(true);
    expect(cmd).toHaveBeenCalledWith(editor, undefined);
  });

  it('should pass args to command function', () => {
    const registry = new CommandRegistry();
    const editor = createMockEditor();
    registry.setEditor(editor);

    const cmd = vi.fn().mockReturnValue(true);
    registry.register('test-cmd', cmd);

    registry.execute('test-cmd', { level: 2 });
    expect(cmd).toHaveBeenCalledWith(editor, { level: 2 });
  });

  it('should return false for unknown commands', () => {
    const registry = new CommandRegistry();
    registry.setEditor(createMockEditor());
    expect(registry.execute('nonexistent')).toBe(false);
  });

  it('should return false when no editor is set', () => {
    const registry = new CommandRegistry();
    registry.register('test', vi.fn().mockReturnValue(true));
    expect(registry.execute('test')).toBe(false);
  });

  it('should check if command exists with has()', () => {
    const registry = new CommandRegistry();
    registry.register('exists', vi.fn());
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('should return all commands via getAll()', () => {
    const registry = new CommandRegistry();
    const cmd1 = vi.fn();
    const cmd2 = vi.fn();
    registry.register('cmd1', cmd1);
    registry.register('cmd2', cmd2);

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.get('cmd1')).toBe(cmd1);
    expect(all.get('cmd2')).toBe(cmd2);
  });

  it('should override command on re-register', () => {
    const registry = new CommandRegistry();
    const editor = createMockEditor();
    registry.setEditor(editor);

    const cmd1 = vi.fn().mockReturnValue(true);
    const cmd2 = vi.fn().mockReturnValue(true);
    registry.register('cmd', cmd1);
    registry.register('cmd', cmd2);

    registry.execute('cmd');
    expect(cmd1).not.toHaveBeenCalled();
    expect(cmd2).toHaveBeenCalled();
  });

  it('should return the command return value', () => {
    const registry = new CommandRegistry();
    registry.setEditor(createMockEditor());

    registry.register('fail', () => false);
    registry.register('succeed', () => true);

    expect(registry.execute('fail')).toBe(false);
    expect(registry.execute('succeed')).toBe(true);
  });
});
