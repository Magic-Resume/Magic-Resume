import { randomUUID } from 'node:crypto';
import {
  AIMessage,
  HumanMessage,
  RemoveMessage,
} from '@langchain/core/messages';
import {
  Command,
  REMOVE_ALL_MESSAGES,
  isGraphInterrupt,
} from '@langchain/langgraph';
import type { Settings } from '../config.js';
import type { ChatRequest, ApprovalRequest } from '../contracts/requests.js';
import type { AgentEvent } from '../contracts/events.js';
import { AgentError } from '../contracts/errors.js';
import type { Persistence } from '../persistence/store.js';
import { createChatModel } from '../model/factory.js';
import {
  createModelTransport,
  type ModelResolver,
} from '../model/transport.js';
import { createHarness } from '../harness/harness.factory.js';
import {
  seedResume,
  readResume,
  RESUME_PATH,
  toolPath,
} from '../harness/workspace/files.js';
import { Sessions } from './sessions.js';
import { EventMapper, type GraphEvent } from './event-mapper.js';
import { ResumeAccumulator } from './resume-accumulator.js';
import { AttachmentStore } from '../attachments/store.js';
import {
  prepareAttachments,
  attachmentReferences,
  createAttachmentContext,
} from '../attachments/context.js';
import type { BaseMessage } from '@langchain/core/messages';
import {
  approvalEvent,
  assertValidDecisions,
  decisionHash,
} from './approvals.js';

export interface StreamItem {
  event?: AgentEvent;
  modelOutput?: boolean;
}
export class RunEngine {
  readonly sessions: Sessions;
  constructor(
    readonly settings: Settings,
    readonly persistence: Persistence,
    private readonly resolver?: ModelResolver,
    private readonly attachmentStore = new AttachmentStore(settings),
  ) {
    this.sessions = new Sessions(persistence);
  }
  async prepare(request: ChatRequest | ApprovalRequest, signal: AbortSignal) {
    const approving = 'decisions' in request;
    const runId = randomUUID();
    const unlock = request.sessionId
      ? this.persistence.acquire(request.sessionId)
      : () => {};
    let transport: Awaited<ReturnType<typeof createModelTransport>> | undefined;
    let claimed = false;
    let started = false;
    try {
      const head = request.sessionId
        ? await this.sessions.head(request.sessionId)
        : undefined;
      const state = request.sessionId
        ? await this.sessions.state(request.sessionId)
        : undefined;
      if (state?.state === 'checkpoint_missing')
        throw new AgentError(409, 'conflict', 'session_checkpoint_missing');
      if (approving) {
        const old = this.persistence.approval(request.operationId);
        if (old)
          throw new AgentError(
            409,
            'conflict',
            old.decision_hash === decisionHash(request.decisions)
              ? 'approval_already_processed'
              : 'approval_decision_conflict',
          );
        assertValidDecisions(state?.pendingApproval, request);
        if (
          request.agentMode === 'ask' &&
          head?.checkpoint.channel_values.permissionMode !== 'ask'
        )
          throw new AgentError(409, 'conflict', 'approval_scope_changed');
      } else if (state?.state === 'awaiting_input')
        throw new AgentError(409, 'conflict', 'session_awaiting_input');
      transport = await createModelTransport(
        request.config.baseUrl,
        this.settings.allowPrivateModelHosts,
        signal,
        this.resolver,
        this.settings.idleTimeoutMs,
      );
      const model = createChatModel(request.config, transport.fetch);
      const previousMessages = (head?.checkpoint.channel_values.messages ??
        []) as BaseMessage[];
      const currentAttachments = approving
        ? attachmentReferences(
            [...previousMessages]
              .reverse()
              .filter((message) => message.getType() === 'human')
              .slice(0, 1),
          )
        : await prepareAttachments(
            request.attachments,
            this.attachmentStore,
            this.settings,
            signal,
            this.resolver,
          );
      const references = [
        ...(request.agentMode === 'ask'
          ? []
          : attachmentReferences(previousMessages)),
        ...currentAttachments,
      ];
      const attachments = references.length
        ? await createAttachmentContext(
            this.attachmentStore,
            references,
            currentAttachments,
            signal,
          )
        : undefined;
      if (attachments) model.prepareMessages = attachments.hydrate;
      const restoredMode =
        approving &&
        typeof head?.checkpoint.channel_values.workflowMode === 'string'
          ? head.checkpoint.channel_values.workflowMode
          : undefined;
      const mode = request.mode ?? restoredMode;
      let activeSkill: string | undefined;
      if (
        approving &&
        Array.isArray(head?.checkpoint.channel_values.messages)
      ) {
        const history = head.checkpoint.channel_values.messages as Array<{
          getType(): string;
          tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
        }>;
        // Restrict restoration to this user turn; earlier turns may have used
        // another skill and must not constrain a new workflow.
        for (const message of [...history].reverse()) {
          if (message.getType() === 'human') break;
          const read = [...(message.tool_calls ?? [])]
            .reverse()
            .find(
              (call) =>
                call.name === 'read_file' &&
                Boolean(toolPath(call.args)) &&
                /^\/skills\/[^/]+\/SKILL\.md$/.test(toolPath(call.args) ?? ''),
            );
          if (read) {
            activeSkill = toolPath(read.args)?.split('/')[2];
            break;
          }
        }
      }
      const harness = createHarness({
        model,
        agentMode: request.agentMode,
        mode,
        activeSkill,
        resume: request.currentResume,
        sessionId: request.sessionId,
        checkpointer: request.sessionId ? this.persistence.saver : undefined,
        skillsDir: this.settings.skillsDir,
        attachments,
        search: this.settings.search
          ? { settings: this.settings, signal, resolver: this.resolver }
          : undefined,
        limits: {
          modelCalls: this.settings.maxModelCalls,
          toolCalls: this.settings.maxToolCalls,
          searches: this.settings.maxSearches,
        },
      });
      const latestUser =
        [...request.messages]
          .reverse()
          .find((message) => message.role === 'user') ??
        request.messages.at(-1)!;
      const history =
        request.agentMode === 'ask' || head ? [latestUser] : request.messages;
      const messages = history.map((message) =>
        ['assistant', 'ai'].includes(message.role)
          ? new AIMessage(message.content)
          : new HumanMessage(
              message.role === 'system'
                ? `Untrusted conversation context:\n${message.content}`
                : message.content,
            ),
      );
      if (!approving && currentAttachments.length) {
        const latest = [...messages]
          .reverse()
          .find((message) => message.getType() === 'human');
        if (latest)
          latest.additional_kwargs = {
            ...latest.additional_kwargs,
            attachments: currentAttachments,
          };
      }
      const oldFiles = head?.checkpoint.channel_values.files as
        Record<string, unknown> | undefined;
      const files =
        request.agentMode === 'ask'
          ? Object.fromEntries(
              Object.keys(oldFiles ?? {}).map((path) => [path, null]),
            )
          : { [RESUME_PATH]: null, ...seedResume(request.currentResume) };
      const askReset =
        request.agentMode === 'ask' && head
          ? [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...messages]
          : messages;
      // The browser snapshot wins at each new turn. Old proposal files cannot
      // become the next turn's source without browser acceptance.
      const input = approving
        ? new Command({
            resume: { decisions: request.decisions },
            update: {
              permissionMode: request.agentMode,
              workflowMode: mode ?? '',
              ...(request.agentMode === 'ask' ? { todos: [] } : {}),
            },
          })
        : {
            messages: askReset,
            files,
            permissionMode: request.agentMode,
            workflowMode: mode ?? '',
            ...(request.agentMode === 'ask' ? { todos: [] } : {}),
          };
      const resumes = new ResumeAccumulator(
        request.currentResume as Record<string, unknown> | undefined,
        request.agentMode,
      );
      const mapper = new EventMapper(resumes);
      if (approving) {
        this.persistence.claimApproval(
          request.operationId,
          request.sessionId!,
          decisionHash(request.decisions),
        );
        claimed = true;
      } else if (request.sessionId)
        this.persistence.recordTurn(
          request.sessionId,
          request.turnId ?? randomUUID(),
          head?.checkpoint.id,
        );
      const { persistence, settings, sessions } = this;
      return {
        runId,
        startedEvent: mapper.begin()[0],
        async *stream(): AsyncGenerator<StreamItem> {
          started = true;
          if (harness.skill)
            for (const event of mapper.skillLoaded(harness.skill))
              yield { event };
          try {
            const events = harness.agent.streamEvents(input, {
              version: 'v2',
              configurable: request.sessionId
                ? { thread_id: request.sessionId, checkpoint_ns: '' }
                : {},
              signal,
              recursionLimit:
                (settings.maxModelCalls + settings.maxToolCalls) * 6 + 30,
            });
            for await (const raw of events) {
              signal.throwIfAborted();
              const event = raw as GraphEvent;
              if (mapper.hasModelOutput(event)) yield { modelOutput: true };
              for (const mapped of mapper.map(event)) yield { event: mapped };
            }
          } catch (error) {
            if (!isGraphInterrupt(error)) throw error;
          }
          signal.throwIfAborted();
          if (request.sessionId) {
            const finalCheckpoint = await sessions.head(request.sessionId);
            const finalResume = readResume(
              finalCheckpoint?.checkpoint.channel_values.files,
            );
            if (finalResume)
              for (const event of resumes.accept(finalResume)) yield { event };
          }
          for (const event of resumes.finalize()) yield { event };
          if (request.sessionId) {
            const state = await sessions.state(request.sessionId);
            if (state.pendingApproval)
              yield { event: approvalEvent(state.pendingApproval) };
            persistence.touch(request.sessionId);
          }
          if (approving) persistence.completeApproval(request.operationId);
          yield { event: { type: 'run_completed' } };
          yield { event: { type: 'done' } };
        },
        async close() {
          try {
            // A claim that never reached execution can be safely retried. Once a
            // step might have run, the operation remains consumed across crashes.
            if (approving && claimed && !started)
              persistence.releaseClaim(request.operationId);
            await transport?.close();
            if (request.sessionId) {
              persistence.touch(request.sessionId);
              // Still under the session lock, so no other run is writing checkpoints.
              persistence.compact(request.sessionId);
            }
          } finally {
            unlock();
          }
        },
      };
    } catch (error) {
      await transport?.close();
      unlock();
      throw error;
    }
  }
}
