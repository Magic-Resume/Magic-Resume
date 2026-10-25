import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { type BaseCheckpointSaver } from '@langchain/langgraph';
import { AgentError } from '../contracts/errors.js';

export interface Turn {
  session_id: string;
  turn_id: string;
  base_checkpoint_id: string | null;
  created_at: number;
  updated_at: number;
}
export class Persistence {
  readonly db: Database.Database;
  readonly saver: BaseCheckpointSaver;
  private readonly locks = new Set<string>();
  /** Compaction edits the SQLite saver's tables, so it applies only to the saver created here. */
  private readonly ownsSaver: boolean;
  constructor(dataDir: string, saver?: BaseCheckpointSaver) {
    if (dataDir !== ':memory:')
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new Database(
      dataDir === ':memory:' ? ':memory:' : join(dataDir, 'checkpoints.sqlite'),
    );
    // Without it, deleted sessions leave free pages and the file never shrinks.
    // An existing file switches modes only through one VACUUM.
    if (this.db.pragma('auto_vacuum', { simple: true }) !== 2) {
      this.db.pragma('auto_vacuum = INCREMENTAL');
      this.db.exec('VACUUM');
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        session_id TEXT NOT NULL, turn_id TEXT NOT NULL, base_checkpoint_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, turn_id)
      );
      CREATE INDEX IF NOT EXISTS turns_activity ON turns(updated_at);
      CREATE TABLE IF NOT EXISTS approvals (
        operation_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('claimed','processed')), created_at INTEGER NOT NULL
      );
    `);
    this.saver = saver ?? new SqliteSaver(this.db);
    this.ownsSaver = !saver;
  }
  /**
   * Every step stores the whole state, so a turn of many steps grows quadratically.
   * Once a run ends, only the head and each turn's base checkpoint are read again
   * (resume, approval and fork); version 4 checkpoints carry their own pending sends.
   */
  compact(session: string): void {
    if (!this.ownsSaver) return;
    const tables = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('checkpoints', 'writes')",
      )
      .get() as { n: number };
    if (tables.n !== 2) return;
    this.db.transaction(() => {
      const head = this.db
        .prepare(
          "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = '' ORDER BY checkpoint_id DESC LIMIT 1",
        )
        .get(session) as { checkpoint_id: string } | undefined;
      if (!head) return;
      const kept =
        'SELECT base_checkpoint_id FROM turns WHERE session_id = ? AND base_checkpoint_id IS NOT NULL UNION SELECT ?';
      for (const table of ['writes', 'checkpoints'])
        this.db
          .prepare(
            `DELETE FROM ${table} WHERE thread_id = ? AND checkpoint_ns = '' AND checkpoint_id NOT IN (${kept})`,
          )
          .run(session, session, head.checkpoint_id);
    })();
  }
  acquire(...sessions: string[]): () => void {
    if (sessions.some((session) => this.locks.has(session)))
      throw new AgentError(409, 'conflict', 'session_busy');
    sessions.forEach((session) => this.locks.add(session));
    return () => sessions.forEach((session) => this.locks.delete(session));
  }
  hasTurns(session: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM turns WHERE session_id = ? LIMIT 1')
        .get(session),
    );
  }
  turn(session: string, id: string): Turn | undefined {
    return this.db
      .prepare('SELECT * FROM turns WHERE session_id = ? AND turn_id = ?')
      .get(session, id) as Turn | undefined;
  }
  recordTurn(session: string, id: string, checkpoint?: string): void {
    if (this.turn(session, id))
      throw new AgentError(409, 'conflict', 'turn_already_exists');
    const now = Date.now();
    this.db
      .prepare('INSERT INTO turns VALUES (?, ?, ?, ?, ?)')
      .run(session, id, checkpoint ?? null, now, now);
  }
  touch(session: string) {
    this.db
      .prepare('UPDATE turns SET updated_at = ? WHERE session_id = ?')
      .run(Date.now(), session);
  }
  approval(operation: string) {
    return this.db
      .prepare(
        'SELECT decision_hash, status FROM approvals WHERE operation_id = ?',
      )
      .get(operation) as
      { decision_hash: string; status: 'claimed' | 'processed' } | undefined;
  }
  claimApproval(operation: string, session: string, hash: string) {
    const old = this.approval(operation);
    if (old)
      throw new AgentError(
        409,
        'conflict',
        old.decision_hash === hash
          ? 'approval_already_processed'
          : 'approval_decision_conflict',
      );
    this.db
      .prepare('INSERT INTO approvals VALUES (?, ?, ?, ?, ?)')
      .run(operation, session, hash, 'claimed', Date.now());
  }
  completeApproval(operation: string) {
    this.db
      .prepare(
        "UPDATE approvals SET status = 'processed' WHERE operation_id = ?",
      )
      .run(operation);
  }
  releaseClaim(operation: string) {
    this.db
      .prepare(
        "DELETE FROM approvals WHERE operation_id = ? AND status = 'claimed'",
      )
      .run(operation);
  }
  async deleteThread(session: string) {
    await this.saver.deleteThread(session);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM turns WHERE session_id = ?').run(session);
      this.db
        .prepare('DELETE FROM approvals WHERE session_id = ?')
        .run(session);
    })();
  }
  async collectExpired(ttlHours: number, now = Date.now()): Promise<number> {
    const sessions = this.db
      .prepare(
        'SELECT session_id FROM turns GROUP BY session_id HAVING MAX(updated_at) < ?',
      )
      .all(now - ttlHours * 3_600_000) as { session_id: string }[];
    let collected = 0;
    for (const { session_id } of sessions) {
      if (this.locks.has(session_id)) continue;
      const unlock = this.acquire(session_id);
      try {
        await this.deleteThread(session_id);
        collected++;
      } finally {
        unlock();
      }
    }
    if (collected) {
      this.db.pragma('incremental_vacuum');
      // In WAL mode the file shrinks only once the log is checkpointed.
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    }
    return collected;
  }
  close() {
    this.db.close();
  }
}
