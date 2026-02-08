import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('focus', handler);
    bus.emit('focus', undefined);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should pass event data to handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('command:execute', handler);
    bus.emit('command:execute', { name: 'test-cmd', args: { x: 1 } });
    expect(handler).toHaveBeenCalledWith({ name: 'test-cmd', args: { x: 1 } });
  });

  it('should support multiple handlers for same event', () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('focus', handler1);
    bus.on('focus', handler2);
    bus.emit('focus', undefined);
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should unsubscribe via returned function', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on('focus', handler);
    unsub();
    bus.emit('focus', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should unsubscribe via off()', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('focus', handler);
    bus.off('focus', handler);
    bus.emit('focus', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not emit after destroy()', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('focus', handler);
    bus.destroy();
    bus.emit('focus', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not add handlers after destroy()', () => {
    const bus = new EventBus();
    bus.destroy();
    const handler = vi.fn();
    bus.on('focus', handler);
    bus.emit('focus', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not throw when removing non-existent handler', () => {
    const bus = new EventBus();
    expect(() => bus.off('focus', vi.fn())).not.toThrow();
  });

  it('should handle multiple event types independently', () => {
    const bus = new EventBus();
    const focusHandler = vi.fn();
    const blurHandler = vi.fn();
    bus.on('focus', focusHandler);
    bus.on('blur', blurHandler);
    bus.emit('focus', undefined);
    expect(focusHandler).toHaveBeenCalledOnce();
    expect(blurHandler).not.toHaveBeenCalled();
  });
});
