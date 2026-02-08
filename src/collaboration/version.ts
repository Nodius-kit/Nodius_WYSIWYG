export class VersionVector {
  private versions: Map<string, number> = new Map();

  constructor(initial?: Record<string, number>) {
    if (initial) {
      for (const [key, val] of Object.entries(initial)) {
        this.versions.set(key, val);
      }
    }
  }

  get(clientId: string): number {
    return this.versions.get(clientId) ?? 0;
  }

  increment(clientId: string): void {
    this.versions.set(clientId, this.get(clientId) + 1);
  }

  set(clientId: string, version: number): void {
    this.versions.set(clientId, version);
  }

  /**
   * Merge with another vector (take max per client).
   */
  merge(other: VersionVector): VersionVector {
    const result = new VersionVector();
    const allKeys = new Set([...this.versions.keys(), ...other.versions.keys()]);
    for (const key of allKeys) {
      result.set(key, Math.max(this.get(key), other.get(key)));
    }
    return result;
  }

  /**
   * Returns true if this vector is strictly newer than the other.
   * (All components >= and at least one component >)
   */
  isNewerThan(other: VersionVector): boolean {
    const allKeys = new Set([...this.versions.keys(), ...other.versions.keys()]);
    let hasGreater = false;
    for (const key of allKeys) {
      const a = this.get(key);
      const b = other.get(key);
      if (a < b) return false;
      if (a > b) hasGreater = true;
    }
    return hasGreater;
  }

  /**
   * Returns true if vectors are concurrent (neither is strictly newer).
   */
  isConcurrentWith(other: VersionVector): boolean {
    return !this.isNewerThan(other) && !other.isNewerThan(this) && !this.equals(other);
  }

  equals(other: VersionVector): boolean {
    const allKeys = new Set([...this.versions.keys(), ...other.versions.keys()]);
    for (const key of allKeys) {
      if (this.get(key) !== other.get(key)) return false;
    }
    return true;
  }

  toJSON(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, val] of this.versions) {
      result[key] = val;
    }
    return result;
  }

  clone(): VersionVector {
    return new VersionVector(this.toJSON());
  }
}
