import type { WidgetEnvelope } from "@magic-resume/genui/contract";
import type { ChatMessage } from "../types";

/**
 * GenUI 卡片在消息流里的落点。
 *
 * 从 `AiChatShell.upsertWidget` 抽出来是因为它出过一次线上问题：模板复刻的第二版预览
 * 卡「发出来了但看不见」。逻辑本身有三条分支加一个状态门，而它此前一行测试都没有——
 * 组件里的 `setMessages` 回调测不了，抽成纯函数才测得了。
 */

/** 还能被更新 / 被裁决的卡。已应用、已取消、已过期的都不是。 */
const isLive = (status: string | undefined): boolean => status === "pending";

/**
 * 把一张卡插进消息流，或更新已有的那张。
 *
 * 同一个 `widgetId` 反复来，原意是「改了三版就更新同一张卡，不堆五张预览」。但这只在
 * 那张卡**还没被裁决**时成立：用户点过「应用」之后它是终态（按钮变「已应用」），再往
 * 上面塞新 props 就成了——新版本落在很久以前那一轮里、按钮还不可点。用户在对话底部
 * 什么都看不到，而模型收到的是「卡已发出」，于是反复重发、反复归咎于「客户端没刷新」。
 *
 * 所以裁决过就当新卡发：那已经是**另一个提案**了，不是同一个提案的新一版。
 */
export function upsertWidgetInMessages(
  prev: ChatMessage[],
  widgetId: string,
  envelope: WidgetEnvelope,
  ownerId: string | undefined,
  newMessageId: () => string,
): ChatMessage[] {
  const mergeProps = (existing: Record<string, unknown>) =>
    envelope.merge ? { ...existing, ...(envelope.props ?? {}) } : (envelope.props ?? {});

  const owner = ownerId ? prev.findIndex((m) => m.id === ownerId) : -1;

  // 旧的那张在哪：先找时间线，再找独立消息。
  const beatOwner = prev.findIndex((m) =>
    m.timeline?.some(
      (beat) =>
        beat.kind === "widget" &&
        beat.widget.widgetId === widgetId &&
        isLive(beat.widget.status),
    ),
  );
  const messageOwner =
    beatOwner === -1
      ? prev.findIndex(
          (m) => m.widget?.widgetId === widgetId && isLive(m.widget.status),
        )
      : -1;
  const at = beatOwner !== -1 ? beatOwner : messageOwner;

  /**
   * 旧卡不在当前这一轮 → **搬过来**，而不是就地改。
   *
   * 有状态的卡（投递面板）用的是固定 widgetId，所以「改一次面板」总是回去更新十几轮
   * 之前那张。用户在最新回复里什么都看不到，得往上翻，翻上去还发现它已经变了——
   * 他刚要的那个结果，被放在了一个他不会看的地方。
   *
   * 搬走 ≠ 复制：全流程只有一张面板卡，只是它跟着最新一次改动走。
   */
  const relocating = at !== -1 && owner !== -1 && at !== owner;

  if (at !== -1 && !relocating) {
    const next = [...prev];
    if (beatOwner !== -1) {
      next[at] = {
        ...prev[at],
        timeline: prev[at].timeline?.map((beat) =>
          beat.kind === "widget" &&
          beat.widget.widgetId === widgetId &&
          isLive(beat.widget.status)
            ? {
                ...beat,
                widget: {
                  ...beat.widget,
                  kind: envelope.kind,
                  props: mergeProps(beat.widget.props),
                },
              }
            : beat,
        ),
      };
    } else {
      const existing = prev[at].widget!;
      next[at] = {
        ...prev[at],
        widget: {
          ...existing,
          kind: envelope.kind,
          props: mergeProps(existing.props),
        },
      };
    }
    return next;
  }

  // 搬家：先把旧位置摘干净，`merge` 语义仍以旧 props 为底。
  let base = prev;
  let carried: Record<string, unknown> = {};
  if (relocating) {
    if (beatOwner !== -1) {
      const beat = prev[at].timeline?.find(
        (b) => b.kind === "widget" && b.widget.widgetId === widgetId,
      );
      if (beat?.kind === "widget") carried = beat.widget.props;
      base = prev.map((m, i) =>
        i === at
          ? {
              ...m,
              timeline: m.timeline?.filter(
                (b) => !(b.kind === "widget" && b.widget.widgetId === widgetId),
              ),
            }
          : m,
      );
    } else {
      carried = prev[at].widget?.props ?? {};
      base = prev.filter((_, i) => i !== at);
    }
  }

  const widget = {
    widgetId,
    kind: envelope.kind,
    props: relocating ? mergeProps(carried) : (envelope.props ?? {}),
    status: "pending" as const,
  };

  // 有正在写的助手气泡，就把卡片挂进**这一轮的时间线**，而不是追加成下一条消息。
  // 追加的话它会排到这一轮的操作栏（复制/重新生成）后面，读起来像是下一轮凭空
  // 冒出来的东西——`push_ui` 的每一张卡此前都是这个毛病，不只是面试那张。
  const target = ownerId ? base.findIndex((m) => m.id === ownerId) : -1;
  if (target !== -1) {
    const next = [...base];
    next[target] = {
      ...base[target],
      timeline: [
        ...(base[target].timeline ?? []),
        { kind: "widget" as const, id: widgetId, widget },
      ],
    };
    return next;
  }

  // 没有归属的一轮（例如引擎在轮次之外推的卡）仍走独立消息。
  return [...base, { id: newMessageId(), role: "widget" as const, widget }];
}

/**
 * 用户点了卡上的按钮之后落状态。
 *
 * **只改还 pending 的那张**：同一个 `widgetId` 现在可能同时存在一张已裁决的旧卡和一张
 * 新卡。不加这个判断，取消新卡会把旧卡从「已应用」改写成「已取消」——回头篡改一件
 * 已经发生过的事。
 */
export function settleWidgetInMessages(
  prev: ChatMessage[],
  widgetId: string,
  status: "submitted" | "cancelled",
): ChatMessage[] {
  return prev.map((m) => {
    if (m.widget?.widgetId === widgetId && isLive(m.widget.status)) {
      return { ...m, widget: { ...m.widget, status } };
    }
    if (
      m.timeline?.some(
        (beat) =>
          beat.kind === "widget" &&
          beat.widget.widgetId === widgetId &&
          isLive(beat.widget.status),
      )
    ) {
      return {
        ...m,
        timeline: m.timeline.map((beat) =>
          beat.kind === "widget" &&
          beat.widget.widgetId === widgetId &&
          isLive(beat.widget.status)
            ? { ...beat, widget: { ...beat.widget, status } }
            : beat,
        ),
      };
    }
    return m;
  });
}
