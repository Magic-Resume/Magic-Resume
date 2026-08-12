import type { ComponentType } from 'react';

/**
 * The GenUI widget contract. The agent surfaces an interactive card either by
 * calling a tool the run pauses on (interrupt path) or by pushing a `ui_widget`
 * event (non-blocking path); both become one `widget` chat message that the
 * host renders through a registry. A new card = a component + one registry
 * entry, never another hardcoded branch in the thread renderer.
 *
 * This package owns *how* a card looks and behaves. Which cards exist, what
 * fields they carry and where their data comes from belong to the consuming
 * app — see its widget registry.
 */

/**
 * Widget kind = the registry key, which on the interrupt path is the tool name
 * (e.g. `request_form`). Deliberately an open `string`: the set of kinds is the
 * app's business contract with its agent, not this package's.
 */
export type WidgetKind = string;

export type WidgetFieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  /** one-tap single choice, rendered as a row of chips */
  | 'chips'
  /** multi-select chips; the value is the picked labels joined by `, ` */
  | 'multi-chips'
  /** a short mutually-exclusive scale (experience level, seniority) */
  | 'segmented'
  /** "2022.03 - 2024.06" / "2024.06 - 至今", matching the resume's single date string */
  | 'month-range'
  /**
   * Type-ahead over a named data source. A field kind rather than its own card
   * so one card can ask for school + degree + dates together — three cards for
   * one education entry is worse than the typing it replaces.
   */
  | 'search';

export interface WidgetOption {
  value: string;
  label: string;
  /** optional second line / logo url, used by richer pickers */
  hint?: string;
  icon?: string;
}

export interface WidgetFormField {
  id: string;
  label: string;
  kind: WidgetFieldKind;
  placeholder?: string;
  options?: WidgetOption[];
  /** the user may leave it empty and still submit */
  optional?: boolean;
  /** offer an "other…" escape that reveals a free-text input */
  allowCustom?: boolean;
  /**
   * The agent may supply this field's `options` (e.g. skills tailored to a
   * role). Only fields marked here accept model-provided options, and the host
   * sanitizes them — everything else keeps the front-end's own list.
   */
  dynamicOptions?: boolean;
  /** for `search`: which registered data source to query. */
  source?: string;
}

/** A named, lazily-loaded option list the host app registers (schools, skills…). */
export interface GenUIDataSource {
  load: () => Promise<WidgetOption[]>;
  /** defaults to a case-insensitive match that ranks prefix hits first. */
  search?: (query: string, all: WidgetOption[]) => WidgetOption[];
}

/** How a widget's result is delivered back to the agent. */
export type WidgetInteraction = 'resume' | 'message' | 'client';

export interface WidgetInstance {
  /** upsert key — the interrupt requestId (or an emit widgetId). */
  widgetId: string;
  kind: WidgetKind;
  /**
   * 暂停在哪个工具上。**只有当 kind 不等于工具名时才需要给**：同一个工具可以按参数
   * 路由到不同的卡（`ask_choice` 有没有推荐 → 两种 kind），而 HITL 的 `edit` 必须
   * 报回真实的工具名，否则续跑会指向一个不存在的工具。
   */
  toolName?: string;
  props: Record<string, unknown>;
  /**
   * `expired` is its own state rather than being folded into `cancelled`: a card
   * restored from an old transcript can no longer be answered, but the user did
   * not decline it, and saying they did is a lie the UI shouldn't tell.
   */
  status: 'pending' | 'submitted' | 'cancelled' | 'expired';
}

/** `ui_widget` SSE payload (non-blocking path); aligns with push_ui_message. */
export interface WidgetEnvelope {
  kind: WidgetKind;
  props: Record<string, unknown>;
  widgetId?: string;
  merge?: boolean;
}

export interface WidgetActionResult {
  type: 'submit' | 'cancel';
  /** for submit: the collected field values keyed by field id. */
  values?: Record<string, string>;
}

export interface WidgetProps {
  instance: WidgetInstance;
  onAction: (result: WidgetActionResult) => void;
}

export interface WidgetDescriptor {
  component: ComponentType<WidgetProps>;
  /** where the user's action goes: resume (HITL respond) / message / client-only. */
  interaction: WidgetInteraction;
  /** validate + shape raw props before render; return null → host degrades to text. */
  normalize?: (props: Record<string, unknown>) => Record<string, unknown> | null;
}

/** The app-owned map of widget kind → descriptor, handed to the host. */
export type WidgetRegistry = Record<string, WidgetDescriptor>;
