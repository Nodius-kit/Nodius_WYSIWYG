import { describe, it, expect } from 'vitest';
import { VersionVector } from '../../src/collaboration/version';

describe('VersionVector', () => {
  it('should initialize empty', () => {
    const vv = new VersionVector();
    expect(vv.get('a')).toBe(0);
  });

  it('should initialize with values', () => {
    const vv = new VersionVector({ a: 3, b: 5 });
    expect(vv.get('a')).toBe(3);
    expect(vv.get('b')).toBe(5);
  });

  it('should increment', () => {
    const vv = new VersionVector();
    vv.increment('a');
    vv.increment('a');
    expect(vv.get('a')).toBe(2);
  });

  it('should merge (take max)', () => {
    const a = new VersionVector({ x: 3, y: 1 });
    const b = new VersionVector({ x: 1, y: 5, z: 2 });
    const merged = a.merge(b);
    expect(merged.get('x')).toBe(3);
    expect(merged.get('y')).toBe(5);
    expect(merged.get('z')).toBe(2);
  });

  it('should detect newer', () => {
    const a = new VersionVector({ x: 3, y: 2 });
    const b = new VersionVector({ x: 2, y: 1 });
    expect(a.isNewerThan(b)).toBe(true);
    expect(b.isNewerThan(a)).toBe(false);
  });

  it('should detect not newer when equal', () => {
    const a = new VersionVector({ x: 1 });
    const b = new VersionVector({ x: 1 });
    expect(a.isNewerThan(b)).toBe(false);
  });

  it('should detect concurrent', () => {
    const a = new VersionVector({ x: 2, y: 1 });
    const b = new VersionVector({ x: 1, y: 2 });
    expect(a.isConcurrentWith(b)).toBe(true);
  });

  it('should detect not concurrent when one is newer', () => {
    const a = new VersionVector({ x: 3, y: 2 });
    const b = new VersionVector({ x: 2, y: 1 });
    expect(a.isConcurrentWith(b)).toBe(false);
  });

  it('should check equality', () => {
    const a = new VersionVector({ x: 1, y: 2 });
    const b = new VersionVector({ x: 1, y: 2 });
    expect(a.equals(b)).toBe(true);
  });

  it('should clone', () => {
    const a = new VersionVector({ x: 1 });
    const b = a.clone();
    b.increment('x');
    expect(a.get('x')).toBe(1);
    expect(b.get('x')).toBe(2);
  });

  it('should serialize to JSON', () => {
    const vv = new VersionVector({ a: 1, b: 2 });
    expect(vv.toJSON()).toEqual({ a: 1, b: 2 });
  });
});
