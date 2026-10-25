/** Storage values are cloned like IndexedDB, so tests cannot pass through shared object references. */
export class MemoryDb {
  items = new Map<string, unknown>();

  async getItem<T>(key: string): Promise<T | null> {
    return structuredClone(this.items.get(key) as T | undefined) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.items.set(key, structuredClone(value));
  }

  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return [...this.items.keys()];
  }
}
