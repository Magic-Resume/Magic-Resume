import type { ApprovalRequest } from '../types';

/**
 * 一次中断该摆出哪些卡、答完之后能不能续跑。
 *
 * 这段簿记原本长在 `AiChatShell` 的事件循环里，测不动——而它恰恰是**错了不会报错**的
 * 那一类：引擎只校验「裁决数量等于动作数量」，裁决**装错了槽**它照样接受，然后模型收到
 * 的是别的动作的答复。界面上什么都不会红。
 *
 * 所以抽成纯函数：判定在这里，React 那边只负责把结果画出来。
 */

export interface InterruptAction {
  name?: string;
  args?: Record<string, unknown>;
}

export interface InterruptSlot {
  requestId: string;
  index: number;
}

export interface PlannedWidget {
  slot: InterruptSlot;
  /** 注册表里的卡片 kind，可能是按参数路由出来的别名。 */
  kind: string;
  /** 真实工具名。`edit` 续跑要靠它——拿别名去续跑会指向一个不存在的工具。 */
  toolName?: string;
  args: Record<string, unknown>;
}

export interface InterruptPlan {
  /** 总动作数 = 必须凑齐的裁决数。 */
  total: number;
  /** 不问用户、直接替他拒掉的槽（如问答模式下的读简历）。 */
  autoRejected: InterruptSlot[];
  /** 各自成卡的动作（表单、选择卡）。 */
  widgets: PlannedWidget[];
  /** 收进同一张分页审批卡的闸门动作，**一页一个**。 */
  gates: ApprovalRequest[];
}

export interface PlanOptions {
  /** 注册表里有没有这个 kind。 */
  hasWidget: (kind: string) => boolean;
  /** 同一个工具按参数路由到不同的卡（ask_choice 表没表态）。 */
  resolveKind: (toolName: string, args?: Record<string, unknown>) => string;
  /** 当前档位允不允许读简历。 */
  allowsResumeRead: boolean;
}

/**
 * 把一次中断的动作分派成卡。
 *
 * **`gates` 里每页自带 `slotIndex`，不是页号。** 自动拒掉的动作不占页，所以两者从第一个
 * 被跳过的动作起就永远对不上了——用页号当槽号，裁决会静默错位。
 */
export function planInterrupt(
  requestId: string,
  actions: InterruptAction[],
  options: PlanOptions,
): InterruptPlan {
  const plan: InterruptPlan = {
    total: actions.length,
    autoRejected: [],
    widgets: [],
    gates: [],
  };

  actions.forEach((action, index) => {
    const slot: InterruptSlot = { requestId, index };
    const toolName = action.name;

    if (toolName === 'read_resume' && !options.allowsResumeRead) {
      plan.autoRejected.push(slot);
      return;
    }

    const kind = toolName ? options.resolveKind(toolName, action.args) : undefined;
    if (kind && options.hasWidget(kind)) {
      plan.widgets.push({ slot, kind, toolName, args: action.args ?? {} });
      return;
    }

    plan.gates.push({
      requestId,
      toolName,
      scope: 'resume',
      status: 'pending',
      slotIndex: index,
      question: typeof action.args?.reason === 'string' ? action.args.reason : undefined,
    });
  });

  return plan;
}

/** 待填的裁决槽。`null` = 这个动作还没人答。 */
export type DecisionSlots<T> = (T | null)[];

export function openDecisions<T>(count: number): DecisionSlots<T> {
  return Array.from({ length: count }, () => null);
}

/**
 * 把一个裁决放进它自己的槽，并回答「能续跑了吗」。
 *
 * 用 `map` 重建而不是 `slots[index] = decision`，是两条不变量的**构造保证**，不是风格：
 *
 * - 越界的裁决自然成为空操作。写成下标赋值，`slots[5]` 会把长度撑到 6 并留下空洞，
 *   而 `every` **跳过空洞**——于是一次落在不存在的动作上的裁决，会让运行提前判定
 *   「答完了」并带着半份裁决续跑。
 * - 长度永远等于动作数，所以「凑齐没有」这件事不需要另外记账。
 *
 * 返回新数组而不是原地改：错位这类 bug 最难查的地方就是「谁在什么时候动了它」。
 */
export function fillDecision<T>(
  slots: DecisionSlots<T>,
  index: number,
  decision: T,
): { slots: DecisionSlots<T>; ready: boolean } {
  const next = slots.map((value, i) => (i === index ? decision : value));
  return { slots: next, ready: next.every((value) => value !== null) };
}
