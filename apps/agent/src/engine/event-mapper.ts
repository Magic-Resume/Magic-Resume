import type { AgentEvent } from '../contracts/events.js';
import { modelError } from '../model/errors.js';
import { contentText } from '../harness/middleware/common.js';
import { TOOL_DISPLAY } from '../harness/tools/display.js';
import type { ResumeAccumulator } from './resume-accumulator.js';
export interface GraphEvent {
  event: string;
  name: string;
  run_id: string;
  parent_ids?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  data: Record<string, unknown>;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
export function failureEvents(
  error: unknown,
  signal?: AbortSignal,
): AgentEvent[] {
  return [
    { type: 'error', payload: modelError(error, signal).payload },
    { type: 'done' },
  ];
}
export class EventMapper {
  private readonly childRuns = new Set<string>();
  private readonly toolInputs = new Map<string, Record<string, unknown>>();
  private planned = false;
  private begun = false;
  begin(): AgentEvent[] {
    if (this.begun) return [];
    this.begun = true;
    return [{ type: 'run_started' }];
  }
  constructor(private readonly resumes: ResumeAccumulator) {}
  isChild(event: GraphEvent) {
    return Boolean(
      event.parent_ids?.some((id) => this.childRuns.has(id)) ||
      event.metadata?.lc_agent_name === 'general-purpose',
    );
  }
  isInternal(event: GraphEvent) {
    return event.tags?.includes('agent:insight') === true;
  }
  hasModelOutput(event: GraphEvent): boolean {
    if (event.event !== 'on_chat_model_stream') return false;
    const chunk = record(event.data.chunk);
    return Boolean(
      contentText(chunk.content) ||
      this.reasoning(chunk) ||
      (Array.isArray(chunk.tool_call_chunks) && chunk.tool_call_chunks.length),
    );
  }
  private reasoning(chunk: Record<string, unknown>): string {
    const blocks = Array.isArray(chunk.content) ? chunk.content : [];
    const content = blocks
      .map((part) => {
        const block = record(part);
        return block.type === 'reasoning'
          ? String(block.reasoning ?? block.text ?? '')
          : '';
      })
      .join('');
    const kwargs = record(chunk.additional_kwargs);
    return (
      content ||
      (typeof kwargs.reasoning_content === 'string'
        ? kwargs.reasoning_content
        : typeof kwargs.reasoning === 'string'
          ? kwargs.reasoning
          : '')
    );
  }
  map(raw: unknown): AgentEvent[] {
    const event = raw as GraphEvent;
    if (!event?.event || !event.data) return [];
    const { name, data, run_id: id } = event;
    if (event.event === 'on_tool_start' && name === 'task')
      this.childRuns.add(id);
    const child = this.isChild(event);
    if (event.event === 'on_custom_event') {
      if (child && ['resume_file_saved', 'budget_summary'].includes(name))
        return [];
      if (name === 'resume_file_saved' && data.resume)
        return this.resumes.accept(data.resume as Record<string, unknown>);
      if (name === 'budget_summary' && typeof data.content === 'string')
        return [{ type: 'message_chunk', content: data.content }];
      if (
        [
          'ui_widget',
          'resume_analysis',
          'fit_report',
          'resume_change_notes',
          'resume_verification',
          'source_update',
        ].includes(name)
      )
        return [{ type: name as 'ui_widget', payload: data }];
      return [];
    }
    if (
      event.event === 'on_chat_model_start' &&
      !child &&
      !this.isInternal(event)
    )
      return [{ type: 'llm_started', payload: { requestId: id } }];
    if (
      event.event === 'on_chat_model_stream' &&
      !child &&
      !this.isInternal(event)
    ) {
      const chunk = record(data.chunk);
      const text = contentText(chunk.content);
      const reasoning = this.reasoning(chunk);
      return [
        ...(reasoning
          ? [{ type: 'reasoning_chunk' as const, content: reasoning }]
          : []),
        ...(text ? [{ type: 'message_chunk' as const, content: text }] : []),
      ];
    }
    if (event.event === 'on_chat_model_end') {
      const output = record(data.output);
      const usage = record(output.usage_metadata);
      if (!Object.keys(usage).length) return [];
      return [
        {
          type: 'llm_usage',
          payload: {
            requestId: id,
            trajectoryVisible: !child && !this.isInternal(event),
            usage: {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              totalTokens: usage.total_tokens,
            },
          },
        },
      ];
    }
    if (child && name !== 'write_todos') return [];
    if (event.event === 'on_tool_start') {
      const args = record(data.input);
      this.toolInputs.set(id, args);
      if (child) return [];
      if (name === 'task')
        return [
          {
            type: 'subagent_started',
            payload: {
              name: args.subagent_type ?? 'general-purpose',
              args: { description: args.description },
            },
          },
        ];
      return [
        {
          type: 'tool_started',
          payload: {
            toolName: name,
            toolCallId: id,
            args: this.safeArgs(name, args),
          },
        },
      ];
    }
    if (event.event === 'on_tool_end' || event.event === 'on_tool_error') {
      const args = this.toolInputs.get(id) ?? record(data.input);
      this.toolInputs.delete(id);
      if (name === 'task')
        return [
          {
            type: 'subagent_completed',
            payload: { name: args.subagent_type ?? 'general-purpose' },
          },
        ];
      const output = record(data.output);
      const failed =
        event.event === 'on_tool_error' || output.status === 'error';
      const result: AgentEvent[] = child
        ? []
        : [
            {
              type: 'tool_result',
              payload: {
                toolCallId: id,
                toolName: name,
                summary: this.summary(name, args, failed, output),
                ...(failed
                  ? {
                      isError: true,
                      error:
                        'The tool did not complete. Review its input or retry the request.',
                    }
                  : {}),
              },
            },
            {
              type: 'tool_completed',
              payload: { toolCallId: id, toolName: name },
            },
          ];
      if (!failed && name === 'write_todos' && Array.isArray(args.todos)) {
        const payload = { todos: args.todos };
        if (!this.planned) {
          result.push({ type: 'agent_plan', payload });
          this.planned = true;
        }
        // The visible checklist currently consumes plan_update, including its first snapshot.
        result.push({ type: 'plan_update', payload });
      }
      const path = String(args.file_path ?? args.path ?? '');
      if (
        !failed &&
        name === 'read_file' &&
        /^\/skills\/[^/]+\/SKILL\.md$/.test(path)
      )
        result.push({
          type: 'skill_loaded',
          payload: { skill: path.split('/')[2], path },
        });
      if (!failed && name === 'web_search') {
        const sources = Array.isArray(output.sources) ? output.sources : [];
        result.push({
          type: 'source_update',
          payload: { toolCallId: id, sources },
        });
      }
      return result;
    }
    if (
      event.event === 'on_chain_error' ||
      event.event === 'on_chat_model_error'
    )
      return failureEvents(data.error);
    return [];
  }
  private safeArgs(
    name: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    if (name === 'write_file' || name === 'edit_file')
      return { file_path: args.file_path ?? args.path };
    if (name === 'read_file' || name === 'ls' || name === 'glob')
      return { path: args.file_path ?? args.path, pattern: args.pattern };
    if (name === 'request_form')
      return { formKind: args.formKind, message: args.message };
    if (name === 'evaluate_fit')
      return { jdCharacters: typeof args.jd === 'string' ? args.jd.length : 0 };
    return {};
  }
  private summary(
    name: string,
    args: Record<string, unknown>,
    failed: boolean,
    output: Record<string, unknown>,
  ): Record<string, unknown> {
    const display = TOOL_DISPLAY[name] ?? { verb: 'read', icon: 'tool' };
    const path = args.file_path ?? args.path;
    if (typeof path === 'string')
      return {
        ...display,
        kind: 'file',
        name: path.split('/').filter(Boolean).at(-1) ?? path,
      };
    if (
      !failed &&
      name === 'read_resume' &&
      typeof output.content === 'string'
    ) {
      try {
        const parsed = JSON.parse(output.content) as {
          resume?: { sections?: Record<string, unknown[]> };
        };
        const count = Object.values(parsed.resume?.sections ?? {}).filter(
          (items) => Array.isArray(items) && items.length,
        ).length;
        return { ...display, kind: 'sections', count };
      } catch {
        /* The UI can still show the operation without its section count. */
      }
    }
    return display;
  }
}
