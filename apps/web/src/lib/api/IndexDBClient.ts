import { openDB, IDBPDatabase } from 'idb';
import { MagicDebugger } from '@/lib/utils/debuggger';

const DB_NAME = 'MagicResumeDB';
const STORE_NAME = 'MagicResumeStore';
const DB_VERSION = 1;
export const RESUMES_KEY = 'resumes_data';

class IndexedDBClient {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private initializationPromise: Promise<void> | null = null;

  init(): Promise<void> {
    // 客户端环境判断
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }
    if (!this.initializationPromise) {
      this.initializationPromise = this._init();
    }
    return this.initializationPromise;
  }
  
  private async _init(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
    try {
      await this.dbPromise;
      MagicDebugger.log('Database initialized successfully.');
    } catch (error) {
      MagicDebugger.error('Failed to initialize database:', error);
      throw error;
    }
  }


  async setItem<T>(key: string, value: T): Promise<void> {
    await this.init();
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.put(STORE_NAME, value, key);
  }

  async getItem<T>(key: string): Promise<T | null> {
    await this.init();
    if (!this.dbPromise) return null;
    const db = await this.dbPromise;
    const value = await db.get(STORE_NAME, key);
    return value === undefined ? null : value;
  }

  async removeItem(key: string): Promise<void> {
    await this.init();
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.delete(STORE_NAME, key);
  }

  /**
   * 库里所有的 key。
   *
   * 用于按前缀扫一批条目（存量对话迁移、过期会话清理）——那两处此前写成
   * `db.getAllKeys?.()`，而这个类根本没有这个方法，于是它们一直扫到空数组。
   */
  async getAllKeys(): Promise<string[]> {
    await this.init();
    if (!this.dbPromise) return [];
    const db = await this.dbPromise;
    const keys = await db.getAllKeys(STORE_NAME);
    return keys.filter((k): k is string => typeof k === 'string');
  }
}

export const dbClient = new IndexedDBClient();
