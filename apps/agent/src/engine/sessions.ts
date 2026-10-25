import { randomUUID } from 'node:crypto';
import { copyCheckpoint } from '@langchain/langgraph';
import type { z } from 'zod';
import type { forkSchema } from '../contracts/requests.js';
import { AgentError } from '../contracts/errors.js';
import type { SessionState } from '../contracts/events.js';
import type { Persistence } from '../persistence/store.js';
import { pendingApproval } from './approvals.js';
export class Sessions {
  constructor(readonly persistence: Persistence) {}
  head(sessionId: string) {
    return this.persistence.saver.getTuple({
      configurable: { thread_id: sessionId, checkpoint_ns: '' },
    });
  }
  async state(sessionId: string): Promise<SessionState> {
    const tuple = await this.head(sessionId);
    if (!tuple)
      return {
        state: this.persistence.hasTurns(sessionId)
          ? 'checkpoint_missing'
          : 'not_found',
      };
    const pending = pendingApproval(sessionId, tuple);
    return {
      state: pending ? 'awaiting_input' : 'active',
      checkpointId: tuple.checkpoint.id,
      ...(pending ? { pendingApproval: pending } : {}),
    };
  }
  async fork(input: z.infer<typeof forkSchema>) {
    const { sourceSessionId: source, newSessionId: destination } = input;
    if (source === destination)
      throw new AgentError(400, 'invalid_input', 'fork_destination_invalid');
    const unlock = this.persistence.acquire(source, destination);
    try {
      if (
        (await this.head(destination)) ||
        this.persistence.hasTurns(destination)
      )
        throw new AgentError(409, 'conflict', 'fork_destination_exists');
      const head = await this.head(source);
      if (!head || head.checkpoint.id !== input.expectedCheckpointId)
        throw new AgentError(409, 'conflict', 'fork_source_stale');
      const turn = this.persistence.turn(source, input.sourceTurnId);
      if (!turn) throw new AgentError(409, 'conflict', 'fork_turn_missing');
      if (!turn.base_checkpoint_id) return {};
      const base = await this.persistence.saver.getTuple({
        configurable: {
          thread_id: source,
          checkpoint_ns: '',
          checkpoint_id: turn.base_checkpoint_id,
        },
      });
      if (
        !base ||
        base.pendingWrites?.some(([, channel]) => channel === '__interrupt__')
      )
        throw new AgentError(409, 'conflict', 'fork_checkpoint_missing');
      const checkpoint = copyCheckpoint(base.checkpoint);
      // UUIDv6 checkpoints sort lexicographically in SQLite; retain that format for a fork head.
      checkpoint.id = base.checkpoint.id;
      checkpoint.ts = new Date().toISOString();
      await this.persistence.saver.put(
        { configurable: { thread_id: destination, checkpoint_ns: '' } },
        checkpoint,
        { source: 'fork', step: base.metadata?.step ?? 0, parents: {} },
        checkpoint.channel_versions,
      );
      this.persistence.recordTurn(
        destination,
        `fork-${randomUUID()}`,
        checkpoint.id,
      );
      return { checkpointId: checkpoint.id };
    } finally {
      unlock();
    }
  }
  async end(session: string) {
    const unlock = this.persistence.acquire(session);
    try {
      await this.persistence.deleteThread(session);
    } finally {
      unlock();
    }
  }
}
