"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  Info,
  ChevronDown,
  Eye,
  EyeOff,
  CornerUpLeft,
  ExternalLink,
} from "@magic-resume/icons";
import { cn } from "@/lib/utils";
import { SKILLS } from "../skills/registry";
import Markdown from "./Markdown";
import { PolarisGlyph } from "../PolarisMark";
import { WidgetHost } from "@magic-resume/genui";
import { WIDGETS } from "../widgets/registry";
import type {
  ApprovalRequest,
  ChatMessage,
  CitationSource,
  SkillId,
} from "../types";
import {
  Icon,
  ApprovalCard as ApprovalPager,
  type ApprovalQuestion,
} from "@magic-resume/genui/beautiful";
import ToolLine from "./ToolLine";
import { splitTrajectoryBeats, visibleAssistantText } from "./trajectory";
import TasksCard, {
  PLAN_DWELL_MS,
  isPlanFulfilled,
  isRetirablePlan,
} from "./TasksCard";
import type { WidgetActionResult } from "@magic-resume/genui/contract";
import ActivityOrb from "./ActivityOrb";
import { activityLabelKey, type AgentActivity } from "./agentActivity";
import { sourceDomain, visibleCitationSources } from "./citationSources";
import SiteFavicon from "./SiteFavicon";
import MessageNavigationRail from "./MessageNavigationRail";
import ReasoningActivity from "./ReasoningActivity";

/** 审批卡上的一页答完了。一次中断可以带多个动作，所以要带页号。 */
type ApprovalDecision = (
  msgId: string,
  pageIndex: number,
  approved: boolean,
) => void;

/**
 * Bot-side avatar. Consecutive bot messages share one avatar: only the first in a
 * run renders it, the rest pass `show={false}` and get a spacer so their text stays
 * aligned under the same column.
 */
/**
 * 「呼吸叙述」的最小单元（docs/specs/ai-working-motion）：一枚随全局心跳呼吸的
 * 北极星，替换线程里所有 spinner —— 系统只有一个心跳，不是一堆各转各的零件。
 */
function BreathGlyph({
  size = 11,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("ai-breath inline-flex shrink-0", className)}
      aria-hidden="true"
    >
      <PolarisGlyph size={size} />
    </span>
  );
}

/**
 * Pre-first-token "thinking" state for chat turns (design §5 思考中 / §8.5). The
 * assistant bubble is created lazily on the first chunk, so without this the thread
 * shows nothing between send and first token — the gap the user reported. Sits at the
 * tail of the thread; hands off to the streaming bubble once text starts.
 */
function formatDuration(seconds: number): string {
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** 已等待的秒数，取自 Beautiful UI 的 LoadingState（等宽数字，避免逐秒抖动）。 */
function Elapsed({ startedAt }: { startedAt?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  return (
    <span className="font-mono text-[11px] tabular-nums text-neutral-500">
      {formatDuration(Math.floor((Date.now() - startedAt) / 1000))}
    </span>
  );
}

function ThinkingIndicator({
  activity,
  startedAt,
}: {
  activity: AgentActivity | null;
  startedAt?: number;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const state = activity ?? "thinking";
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      // 不淡出，直接撤。
      //
      // 它总是被「插在它上方」的新消息接替，而那条新消息恰好落在它原来的位置上——
      // 也就是说接班人一挂载，它就被往下推。这时候再演 100ms 淡出，看到的是一颗球
      // 边淡边往下滑、另一颗一模一样的球在原位亮起：两颗球错位同框。瞬间撤掉，那个
      // 位置就只有一颗球，读起来是「同一颗没动过」。
      exit={{ opacity: 0, transition: { duration: 0 } }}
      // 不写 transition 就吃 framer-motion 默认的 spring，跟全局那条 180ms 缓动
      // 对不上——而这正是「思考中 → 开始落笔」的交接点，最不该是另一种手感。
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-2.5 text-neutral-200"
    >
      {/* 形态随真实活动走：读取简历和汇总评分不再长一个样。
          **不换成 Beautiful UI 的点阵**——那颗球是品牌锚点（.impeccable.md），且它
          还额外承载「在做什么」；点阵只表示「在忙」。 */}
      <ActivityOrb activity={state} />
      <span
        className="bg-clip-text text-xs font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      >
        {t(activityLabelKey(state))}
      </span>
      {/* 耗时是纯增量：此前一整轮都没有任何「已经等了多久」的信息，长任务里那正是
          用户最想知道的一件事。 */}
      <Elapsed startedAt={startedAt} />
    </motion.div>
  );
}

/**
 * 老消息（`role === "tools"`，或没有 `timeline` 的历史助手消息）的工具列表。
 *
 * 新消息走 `message.timeline`，工具行按真实顺序夹在文字之间；这里只保证旧数据也是
 * 平铺、不折叠、不漏函数名的同一套观感。
 */
function ToolTrace({ message }: { message: ChatMessage }) {
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return null;
  return (
    <div className="w-full max-w-lg">
      {calls.map((call) => (
        <ToolLine key={call.toolCallId} call={call} sources={message.sources} />
      ))}
    </div>
  );
}

/**
 * 助手消息的正文：**按真实发生顺序**铺开的一段旁白。
 *
 * 此前是固定三桶（思考 → 工具 → 正文）。于是模型「我去查一下 JD」那句先说的话，会被
 * 渲染到它所预告的那次工具调用**下面**——而那句话的全部价值就在于它出现在动手之前。
 * 有 `timeline` 就按 `timeline` 走；没有（老的持久化消息）回落到原来的排法。
 *
 * 流式光标只挂最后一段文字：中间那些已经封段的话早就说完了，不该还在闪。
 */
function AssistantBody({
  message,
  onWidgetAction,
}: {
  message: ChatMessage;
  onWidgetAction?: (widgetId: string, result: WidgetActionResult) => void;
}) {
  const streaming = Boolean(
    message.streamed &&
    message.status === "running" &&
    visibleAssistantText(message).trim(),
  );
  const orderedBeats = message.timeline;
  const beats = message.trajectory
    ? splitTrajectoryBeats(message).visible
    : orderedBeats;

  if (!beats?.length) {
    // 轨迹页接管了完整历史；对话页在运行中只保留**最后一个**真实动作作为状态锚点。
    // 否则工具一开始，刚才的旁白移入轨迹后气泡会变成空白，用户又回到“是不是挂了”。
    if (message.trajectory && orderedBeats?.length) {
      const latest = message.toolCalls?.at(-1);
      return message.status === "running" && latest ? (
        <ToolLine call={latest} sources={message.sources} />
      ) : null;
    }
    return (
      <>
        {message.toolCalls?.length ? (
          <div className={cn((message.content ?? "").trim() && "mb-2")}>
            <ToolTrace message={message} />
          </div>
        ) : null}
        <Markdown streaming={streaming} sources={message.sources}>
          {message.content ?? ""}
        </Markdown>
      </>
    );
  }

  const lastTextIndex = beats.reduce(
    (found, beat, index) => (beat.kind === "text" ? index : found),
    -1,
  );

  return (
    <>
      {beats.map((beat, index) =>
        beat.kind === "tool" ? (
          <div key={beat.id} className="my-1">
            <ToolLine call={beat.call} sources={message.sources} />
          </div>
        ) : beat.kind === "widget" ? (
          <div key={beat.id} className="my-2 flex items-start">
            <WidgetHost
              registry={WIDGETS}
              instance={beat.widget}
              context={{ sources: message.sources }}
              onAction={onWidgetAction ?? (() => {})}
            />
          </div>
        ) : (
          <Markdown
            key={beat.id}
            streaming={streaming && index === lastTextIndex}
            sources={message.sources}
          >
            {beat.text}
          </Markdown>
        ),
      )}
    </>
  );
}

/**
 * A tool activity line (e.g. read_resume) with a pending → done transition. Muted and
 * indented to sit under the bot avatar column; breathing star + narrated text while
 * running, subtle check when finished.
 */
function ActivityLine({ message }: { message: ChatMessage }) {
  const running = message.status === "running";
  const failed = message.status === "failed";
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[11px]",
        failed ? "text-amber-300/80" : "text-neutral-500",
      )}
    >
      {running ? (
        <ActivityOrb activity="working" />
      ) : failed ? (
        <AlertCircle size={12} className="shrink-0" aria-hidden />
      ) : (
        <Check size={11} className="shrink-0 text-neutral-600" />
      )}
      <span className={cn("truncate", running && "ai-narrate")}>
        {message.content}
      </span>
    </div>
  );
}

function ExecCard({
  message,
  onToggleCanvas,
  isCanvasOpen,
}: {
  message: ChatMessage;
  onToggleCanvas: (id: SkillId) => void;
  isCanvasOpen: boolean;
}) {
  const { t } = useTranslation();
  const skill = message.skillId ? SKILLS[message.skillId] : null;
  if (!skill) return null;
  const Icon = skill.icon;
  const running = message.status === "running";
  const clickable = !running && !!skill.canvas;

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${skill.accentHex}1f` }}
        >
          <Icon size={14} className={skill.accent} />
        </div>
        <span className="text-[13px] font-medium text-white">{skill.name}</span>
        {running ? (
          <BreathGlyph size={13} className="ml-auto text-sky-400/80" />
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <Check size={12} />
            {t("aiLab.chat.done")}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-xs text-neutral-500 truncate",
            running && "ai-narrate",
          )}
        >
          {running ? t("aiLab.chat.running") : skill.doneSummary}
        </span>
        {clickable && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-400 bg-sky-500/10 group-hover:bg-sky-500/20 rounded-full px-2.5 py-1 shrink-0 transition-colors">
            {isCanvasOpen ? <EyeOff size={12} /> : <Eye size={12} />}
            {isCanvasOpen ? t("aiLab.chat.collapse") : t("aiLab.chat.view")}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="flex items-start">
      {clickable ? (
        <button
          type="button"
          onClick={() => onToggleCanvas(skill.id)}
          className="group text-left min-w-[280px] max-w-sm rounded-2xl bg-neutral-900 hover:bg-neutral-800/80 px-4 py-3.5 transition-colors cursor-pointer"
        >
          {body}
        </button>
      ) : (
        <div className="min-w-[260px] max-w-sm rounded-2xl bg-neutral-900 px-4 py-3.5">
          {body}
        </div>
      )}
    </div>
  );
}

/**
 * Human-in-the-loop approval prompt. The assistant asks before a sensitive action;
 * the user must allow / deny before it continues.
 */
/**
 * 这一轮要用户拍的板，一页一个。
 *
 * 此前每个待批准的动作各是一张卡，竖着排；用户看不出「这一轮要我拍几个板、拍到第几个
 * 了」。换成分页卡之后，进度胶囊把它说出来了。
 *
 * 这里只做翻译：把中断动作翻成 `ApprovalQuestion`，把「第几页选了什么」翻回
 * approve/reject。判定与续跑都在 shell 那边（`handleApproval` → `answerInterrupt`）。
 */
function ApprovalCard({
  message,
  onApproval,
}: {
  message: ChatMessage;
  onApproval?: ApprovalDecision;
}) {
  const { t } = useTranslation();
  const pages = message.approvals;
  if (!pages?.length) return null;

  const allow = t("aiLab.chat.approval.allow");
  const deny = t("aiLab.chat.approval.deny");

  /** 已答的那一页显示什么。读简历还有「正在读 / 已读取」两级进度。 */
  const answeredOf = (a: ApprovalRequest): string | undefined => {
    if (a.status === "pending") return undefined;
    if (a.status === "expired") return t("aiLab.widgets.form.expired");
    if (a.status === "denied") return t("aiLab.chat.approval.denied");
    if (a.readState === "read") return t("aiLab.chat.approval.read");
    if (a.readState === "reading") return t("aiLab.chat.approval.reading");
    return t("aiLab.chat.approval.allowed");
  };

  const questions: ApprovalQuestion[] = pages.map((a) => ({
    q: a.question || message.content || t("aiLab.chat.approval.defaultMessage"),
    type: "radio",
    options: [allow, deny],
    answered: answeredOf(a),
  }));

  return (
    <div className="flex items-start">
      <ApprovalPager
        questions={questions}
        // 会话从本地记录恢复时后端线程早已回收，续跑必失败——那时整张卡只能读不能点。
        disabled={pages.every((a) => a.status === "expired")}
        labels={{
          previous: t("aiLab.chat.approval.previous"),
          next: t("aiLab.chat.approval.next"),
          send: t("aiLab.chat.approval.send"),
          goTo: t("aiLab.chat.approval.goTo"),
          freeText: "",
          freeTextAria: "",
        }}
        onAnswer={(pageIndex, answer) =>
          onApproval?.(message.id, pageIndex, answer[0] === allow)
        }
      />
    </div>
  );
}

function LogLine({
  message,
  onLogClick,
}: {
  message: ChatMessage;
  onLogClick?: (resumePath: string) => void;
}) {
  const { t } = useTranslation();
  const clickable = !!message.resumePath && !!onLogClick;
  // 颜色替代阅读：扫一眼就知道这行是「成了 / 只是说明 / 没成」，不必读完文字。
  // 三档都留在同一行的体量里——不抢戏，只是让人看得见。
  const tone = message.tone ?? "ok";
  const toneStyle = {
    ok: { text: "text-neutral-500", icon: "text-emerald-500/80", Icon: Check },
    info: { text: "text-sky-400/85", icon: "text-sky-400/70", Icon: Info },
    warn: {
      text: "text-amber-500/90",
      icon: "text-amber-500/80",
      Icon: AlertCircle,
    },
  }[tone];
  const { Icon } = toneStyle;
  const className = `flex items-center gap-2 text-[11px] ${toneStyle.text}`;
  const body = (
    <>
      <Icon size={12} className={`${toneStyle.icon} shrink-0`} />
      <span className="truncate">{message.content}</span>
    </>
  );
  if (!clickable) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onLogClick!(message.resumePath!)}
      title={t("aiLab.chat.backToChange")}
      className={`${className} hover:text-neutral-300 transition-colors cursor-pointer w-full text-left`}
    >
      {body}
    </button>
  );
}

/** 回答使用的外部网页来源。内部知识来源已进消息模型，但目前按产品决定不渲染。 */
function SourcesBlock({
  sources = [],
  children,
}: {
  sources?: CitationSource[];
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const visible = visibleCitationSources(sources);
  if (!visible.length && !children) return null;

  return (
    <div className="mt-1.5">
      <div className="flex min-h-7 flex-wrap items-center gap-1">
        {children}
        {visible.length ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={t("aiLab.sources.toggle", { count: visible.length })}
            className="inline-flex h-7 items-center gap-2 rounded-[7px] px-2 text-[12px] text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.98]"
          >
            <span className="flex -space-x-1" aria-hidden="true">
              {visible.slice(0, 3).map((source) => (
                <SiteFavicon
                  key={source.id}
                  source={source}
                  className="size-[18px] rounded-full border border-raised"
                  iconSize={9}
                />
              ))}
            </span>
            <span>{t("aiLab.sources.count", { count: visible.length })}</span>
            <ChevronDown
              size={11}
              className={cn(
                "transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        ) : null}
      </div>

      {visible.length ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            {/*
              每条来源固定为 44px；250px = 5 行 + 4 个间距 + 内边距 + 边框。
              因而前五条完整可见，第六条起只在来源面板内滚动。
            */}
            <div className="mt-1.5 grid max-h-[250px] auto-rows-[44px] gap-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-line bg-inset p-1.5 shadow-hairline">
              {visible.map((source) => {
                const domain = source.url ? sourceDomain(source.url) : "";
                return (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/source flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
                  >
                    <SiteFavicon
                      source={source}
                      className="size-5 rounded-md border border-line"
                      iconSize={10}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-ink-2 group-hover/source:text-ink">
                        {source.title}
                      </span>
                      <span className="block truncate text-[10px] text-ink-3">
                        {domain}
                        {source.publishedDate
                          ? ` · ${source.publishedDate}`
                          : ""}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-ink-3">
                      {source.citationId}
                    </span>
                    <ExternalLink
                      size={11}
                      className="shrink-0 text-ink-3 group-hover/source:text-accent-ink"
                    />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 折叠态最多显示几行。约等于一屏气泡的高度，再多就该由用户决定要不要看。 */
const USER_MESSAGE_CLAMP_LINES = 10;

/**
 * 用户发出的正文。
 *
 * ## 为什么要折叠
 *
 * 用户会往对话里贴 URL、data URI、整段 JD。一条 base64 图片能撑出几十屏，把上下文里
 * 真正在发生的事全顶出视野——而那条消息的内容用户自己最清楚，不需要一直看着。
 *
 * ## 为什么按渲染高度判断而不是字数
 *
 * 同样 200 个字符，一段中文是两行，一条 data URI 是十几行。字数阈值对这两种内容里的
 * 一种必定是错的。量实际溢出没有这个问题，代价只是一次 layout 读。
 *
 * ## 为什么展开后不再测量
 *
 * 展开态下 `scrollHeight === clientHeight`，再测就会得出「没有溢出」，按钮当场消失、
 * 用户再也收不回去。所以只在折叠态测，展开时沿用上一次的结论。
 */
function UserMessageText({ text }: { text: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    // 1px 容差：亚像素行高会让 scrollHeight 比 clientHeight 大出零点几，
    // 严格比较会给每条不该有按钮的消息都挂上按钮。
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    // 面板可以拖宽拖窄，宽度一变行数就变。
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <>
      {/*
        `[overflow-wrap:anywhere]`：URL 和 data URI **一个断行机会都没有**，默认的
        `overflow-wrap: normal` 不肯拆，整条会从气泡右边缘一路铺出去盖住页面。用
        `anywhere` 而不是 `break-words`——只有前者参与 min-content 计算，在这个 flex
        子项里 `break-words` 拆不动；`break-all` 又太狠，会把正常中英文拦腰截断。

        `whitespace-pre-wrap`：用户按 Enter 敲的换行不保留就会被压成空格，
        「这个是腾讯的」于是和上一行的 URL 挤成同一句。
      */}
      <div
        ref={ref}
        className="whitespace-pre-wrap [overflow-wrap:anywhere]"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: USER_MESSAGE_CLAMP_LINES,
                overflow: "hidden",
              }
        }
      >
        {text}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 cursor-pointer text-[13px] text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {/* 用通用的那对，不借 `aiLab.chat.collapse`——那半个键归画布按钮
              （「收起 / 查看」）所有，借来就是两个控件共用一份文案、一起被改。 */}
          {expanded ? t("common.collapse") : t("common.expand")}
        </button>
      )}
    </>
  );
}

function Bubble({
  message,
  onRegenerate,
  onWidgetAction,
}: {
  message: ChatMessage;
  /** 只有最后一条助手回复拿得到，见 `MessageActions`。 */
  onRegenerate?: () => void;
  /** 时间线里的非阻塞卡片要能把用户动作交回去。 */
  onWidgetAction?: (widgetId: string, result: WidgetActionResult) => void;
}) {
  if (message.role === "user") {
    const skill = message.skillId ? SKILLS[message.skillId] : null;
    const SkillIcon = skill?.icon;
    return (
      <div className="flex justify-end">
        <div className="min-w-0 max-w-[80%] rounded-2xl bg-neutral-800 px-4 py-2.5 text-[16px] leading-7 text-neutral-100">
          {skill && (
            <span className="inline-flex items-center gap-1 align-middle mr-2 rounded-md bg-neutral-700/70 px-1.5 py-0.5">
              {SkillIcon && <SkillIcon size={11} className={skill.accent} />}
              <span className={cn("text-[11px] font-medium", skill.accent)}>
                {skill.name}
              </span>
            </span>
          )}
          {message.attachmentNames?.length ? (
            <div className="mb-1.5 flex items-start gap-1.5 text-left text-[13px] leading-5 text-neutral-200">
              <Icon
                name="attach"
                size={12}
                className="mt-1 shrink-0 text-neutral-400"
              />
              <div className="min-w-0 space-y-1">
                {message.attachmentNames.map((name) => (
                  <div key={name} className="truncate" title={name}>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : message.attachment ? (
            <Icon
              name="attach"
              size={12}
              className="mr-1.5 inline-block align-[-1px] text-neutral-400"
            />
          ) : null}
          {message.quote && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-sunk px-2.5 py-2 text-left ring-1 ring-white/[0.05]">
              <CornerUpLeft
                size={12}
                className="mt-0.5 shrink-0 text-sky-400/80"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium text-neutral-500">
                  {message.quote.label}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-neutral-300">
                  {message.quote.text}
                </div>
              </div>
            </div>
          )}
          <UserMessageText text={message.content ?? ""} />
        </div>
      </div>
    );
  }
  const hasProcess = Boolean(message.reasoning);
  return (
    // `group/msg` 命名而不是裸 `group`：这棵树里已经有别的 group（技能卡、工具行），
    // 裸 group 会让最近的那个祖先赢，操作行于是跟着无关的元素亮起来。
    <div className="group/msg flex items-start">
      {/* 限宽。用户气泡是 max-w-[80%] 右对齐，助手正文原本 flex-1 吃满整列——
          一边缩着一边顶到边，读起来就是失衡，长句还会一路铺到用户气泡那一侧下方。
          给助手一个略宽于用户的上限：它是长文，但不该无边界。 */}
      {/* pt-1 是给正文做光学对齐的；有思考头时不能要——它会把那一行压低 4px，
          而这一行必须和它接替的尾部指示器落在同一条基线上。 */}
      {/* 助手正文同样要能拆开无断点的长串——它现在正好会回显 logo 的 URL。
          `overflow-wrap` 可继承，挂在容器上就覆盖了 markdown 的段落、列表与行内
          `<code>`；代码块不受影响，`<pre>` 的 `white-space: pre` 本就不换行，
          它的横向滚动照旧。 */}
      <div
        className={cn(
          // `text-ink`（oklch 0.93）而不是 `text-neutral-200`：数值几乎一样，但它跟着
          // 主题令牌走，浅色主题切过去时不会留下一块亮灰。
          "min-w-0 max-w-[88%] text-[16px] leading-7 text-ink [overflow-wrap:anywhere]",
          !hasProcess && "pt-1",
        )}
      >
        <AssistantResponse
          message={message}
          onRegenerate={onRegenerate}
          onWidgetAction={onWidgetAction}
        />
      </div>
    </div>
  );
}

/**
 * 思考视窗与正文的交接点。
 *
 * 首个正文 token 到达时，ReasoningActivity 先按原版 AgentDisclosure 收缩；只有它的
 * 动画真实完成后才挂正文。不能用固定 timeout 猜时长，也不能让空 Markdown 提前发光标。
 */
function AssistantResponse({
  message,
  onRegenerate,
  onWidgetAction,
}: {
  message: ChatMessage;
  onRegenerate?: () => void;
  onWidgetAction?: (widgetId: string, result: WidgetActionResult) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const hasProcess = Boolean(message.reasoning);
  const visibleText = visibleAssistantText(message);
  const reasoningRunning =
    hasProcess && message.status === "running" && !visibleText;
  const reasoningRunningRef = useRef(reasoningRunning);
  reasoningRunningRef.current = reasoningRunning;
  const observedLiveReasoningRef = useRef(reasoningRunning);
  const [answerReady, setAnswerReady] = useState(!reasoningRunning);

  useEffect(() => {
    if (reasoningRunning) {
      observedLiveReasoningRef.current = true;
      setAnswerReady(false);
      return;
    }
    // 历史消息没有现场折叠过程，直接显示正文；减少动态效果时也不制造等待。
    if (!observedLiveReasoningRef.current || reduceMotion) {
      setAnswerReady(true);
    }
  }, [reasoningRunning, reduceMotion]);

  return (
    <>
      {hasProcess && (
        <ReasoningActivity
          text={message.reasoning ?? ""}
          running={reasoningRunning}
          onCollapseComplete={() => {
            if (reasoningRunningRef.current) return;
            observedLiveReasoningRef.current = false;
            setAnswerReady(true);
          }}
        />
      )}
      {answerReady ? (
        <>
          <AssistantBody message={message} onWidgetAction={onWidgetAction} />
          {/* 来源和复制/重新生成属于完成态工具栏。搜索进行中只显示上面的搜索过程，
              不提前挂一份重复来源；最终正文完成后再一起出现。 */}
          {message.status === "done" && visibleText.trim() ? (
            <SourcesBlock sources={message.sources}>
              <MessageActions text={visibleText} onRegenerate={onRegenerate} />
            </SourcesBlock>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/**
 * 一条助手回复写完之后的操作行。
 *
 * 形态取自 Beautiful UI 的 StreamingText——但**只保留复制**：重试要重发这一轮（会
 * 二次计费且可能覆盖已接受的改动），赞踩要有反馈通道，两者都还没有。做一个点了没反应
 * 的按钮，比没有这个按钮更糟。
 */
function MessageActions({
  text,
  onRegenerate,
}: {
  text: string;
  onRegenerate?: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-0.5 opacity-60 transition-opacity duration-150",
        "group-hover/msg:opacity-100 focus-within:opacity-100 hover:opacity-100",
      )}
    >
      <button
        type="button"
        aria-label={t("aiLab.chat.copy")}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={cn(
          "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors",
          copied ? "text-green" : "text-ink-3 hover:bg-hover hover:text-ink-2",
        )}
      >
        {copied ? <Check size={12} /> : <Icon name="copy" size={12} />}
        {copied ? t("aiLab.chat.copied") : t("aiLab.chat.copy")}
      </button>
      {/* 只挂在最后一条回复上。给历史里任何一条都配重答，等于允许把对话改成一棵树，
          而这个界面只画得出一条线。 */}
      {onRegenerate && (
        <button
          type="button"
          aria-label={t("aiLab.chat.regenerate")}
          onClick={onRegenerate}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
        >
          <Icon name="retry" size={12} />
          {t("aiLab.chat.regenerate")}
        </button>
      )}
    </div>
  );
}

type ChatThreadProps = {
  messages: ChatMessage[];
  /** 右侧画布/报告出现时隐藏消息导航，避免两个右侧表面争抢同一块空间。 */
  navigationVisible?: boolean;
  onToggleCanvas: (id: SkillId) => void;
  openCanvasSkillId: SkillId | null;
  onLogClick?: (resumePath: string) => void;
  /** resolve a tool-approval card (human-in-the-loop) */
  onApproval?: ApprovalDecision;
  /** a GenUI widget card was acted on (submit / cancel) */
  onWidgetAction?: (widgetId: string, result: WidgetActionResult) => void;
  /** a chat turn is awaiting its first token — render the thinking placeholder */
  thinking?: boolean;
  /** agent 此刻在干什么（由 SSE 事件推导）——驱动 orb 形态与旁白文案 */
  activity?: AgentActivity | null;
  /** 重答最后一轮。不给就不渲染那个按钮。 */
  onRegenerate?: () => void;
};

type MessageRowProps = {
  message: ChatMessage;
  reduceMotion: boolean;
  retired: boolean;
  activity?: AgentActivity | null;
  openCanvasSkillId: SkillId | null;
  regenerable: boolean;
  onToggleCanvas: (id: SkillId) => void;
  onLogClick?: (resumePath: string) => void;
  onApproval?: ApprovalDecision;
  onWidgetAction?: (widgetId: string, result: WidgetActionResult) => void;
  onRegenerate?: () => void;
};

/**
 * A stream frame changes only the active assistant message. Keeping each row as
 * a memoized leaf prevents that frame from reparsing every completed Markdown
 * response and rebuilding every historical card above it.
 */
const MessageRow = memo(function MessageRow({
  message: m,
  reduceMotion,
  retired,
  activity,
  openCanvasSkillId,
  regenerable,
  onToggleCanvas,
  onLogClick,
  onApproval,
  onWidgetAction,
  onRegenerate,
}: MessageRowProps) {
  const takesOverThinking =
    m.role === "assistant" && !!m.reasoning && !m.content;
  const isUser = m.role === "user";

  return (
    <motion.div
      data-slot="message"
      data-from={m.role}
      data-message-id={m.id}
      initial={
        takesOverThinking
          ? false
          : isUser
            ? {
                opacity: 0,
                y: reduceMotion ? 0 : 10,
                scale: reduceMotion ? 1 : 0.92,
              }
            : {
                opacity: 0,
                y: reduceMotion ? 0 : 16,
                scale: reduceMotion ? 1 : 0.98,
              }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{
        duration: reduceMotion ? 0 : isUser ? 0.26 : 0.3,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={isUser ? { transformOrigin: "100% 100%" } : undefined}
    >
      {m.role === "exec" ? (
        <ExecCard
          message={m}
          onToggleCanvas={onToggleCanvas}
          isCanvasOpen={openCanvasSkillId === m.skillId}
        />
      ) : m.role === "log" ? (
        <LogLine message={m} onLogClick={onLogClick} />
      ) : m.role === "activity" ? (
        <ActivityLine message={m} />
      ) : m.role === "approval" ? (
        <ApprovalCard message={m} onApproval={onApproval} />
      ) : m.role === "tools" ? (
        <ToolTrace message={m} />
      ) : m.role === "plan" ? (
        <TasksCard
          message={m}
          retired={retired}
          onToggleCanvas={onToggleCanvas}
          isCanvasOpen={Boolean(m.skillId && openCanvasSkillId === m.skillId)}
          activity={activity}
        />
      ) : m.role === "widget" ? (
        m.widget ? (
          <div className="flex items-start">
            <WidgetHost
              registry={WIDGETS}
              instance={m.widget}
              context={{ sources: m.sources }}
              onAction={onWidgetAction ?? (() => {})}
            />
          </div>
        ) : null
      ) : (
        <Bubble
          message={m}
          onRegenerate={regenerable ? onRegenerate : undefined}
          onWidgetAction={onWidgetAction}
        />
      )}
    </motion.div>
  );
});

export { isPlanFulfilled, isRetirablePlan };

export default function ChatThread({
  messages,
  navigationVisible = true,
  onToggleCanvas,
  openCanvasSkillId,
  onLogClick,
  onApproval,
  onWidgetAction,
  thinking,
  activity,
  onRegenerate,
}: ChatThreadProps) {
  // 只有最后一条写完的助手回复能重答。这一轮还在跑的时候不给——重答会把它顶掉，
  // 而用户此刻看到的正是它在写。
  const regenerableId = (() => {
    if (!onRegenerate || thinking) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === "assistant") return m.status === "done" ? m.id : null;
      if (m.role === "user") return null;
    }
    return null;
  })();
  // 这一轮从什么时候开始等的。`thinking` 由 false → true 的那一刻记一次，之后整轮不变
  // ——每次重渲都取 Date.now() 的话，计时永远显示 0。
  const [thinkingSince, setThinkingSince] = useState<number | undefined>(
    undefined,
  );
  useEffect(() => {
    setThinkingSince(thinking ? Date.now() : undefined);
  }, [thinking]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const followOutputRef = useRef(true);
  const previousLastIdRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const el = scrollRef.current;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const addedMessage = previousLastIdRef.current !== lastId;
    previousLastIdRef.current = lastId;
    if (!el || !followOutputRef.current) return;
    if (scrollFrameRef.current !== null)
      cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      el.scrollTo({
        top: el.scrollHeight,
        // 平滑只属于“新增一条消息”。流式增长若每帧都开 smooth，会堆叠动画并不断强制布局。
        behavior: addedMessage && !reduceMotion ? "smooth" : "auto",
      });
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, thinking, reduceMotion]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Programmatic smooth scrolling also fires `scroll`; only use it to re-arm
    // following at the bottom, never to mistake our own animation for user intent.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) {
      followOutputRef.current = true;
    }
  };

  const pauseFollowing = () => {
    followOutputRef.current = false;
  };

  // 头像不再进对话：Polaris 已经常驻在输入框上方的工位，姿态（思考 / 输出）由那只
  // 宠物统一表达。每条消息再挂一个头像，等于把同一个角色复制 N 份。

  /**
   * 技能清单卡跑完就收成一行。
   *
   * 清单是**过程**信息，结果是**产物**——产物已经在右侧画布上，左边再留一张卡宣告
   * 同一件事就是割裂（项目原则①：画布是舞台，对话是旁白）。但也不能什么都不留：
   * 右侧那份报告没有别的入口，实时画布会把它顶掉。所以收成一行可点的指针。
   *
   * 先停一拍再收：不停的话最后一步打勾的同一帧卡就变了，用户根本没看到它完成。
   */
  const [retired, setRetired] = useState<ReadonlySet<string>>(
    () =>
      new Set(messages.filter(isRetirablePlan).map((message) => message.id)),
  );
  useEffect(() => {
    const pending = messages.filter(
      (m) => isRetirablePlan(m) && !retired.has(m.id),
    );
    if (!pending.length) return;
    const timers = pending.map((m) =>
      window.setTimeout(() => {
        setRetired((prev) => new Set(prev).add(m.id));
      }, PLAN_DWELL_MS),
    );
    return () => timers.forEach((tm) => window.clearTimeout(tm));
  }, [messages, retired]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={(event) => {
          if (event.deltaY < 0) pauseFollowing();
        }}
        onTouchMove={pauseFollowing}
        className="h-full overflow-y-auto scrollbar-hide px-4 py-6"
      >
        <div ref={contentRef} className="max-w-3xl mx-auto flex flex-col gap-5">
          {/* New messages rise + fade in (Claude-desktop style 由下到上); keyed by id
              so only freshly-mounted turns animate, never re-renders of existing ones.
              外层 AnimatePresence 是 exit 能播的前提——没有它,流式过程中一条消息被
              替换（activity → assistant 之类）就是硬切,写了 exit 也等于没写。 */}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                reduceMotion={reduceMotion}
                retired={retired.has(m.id)}
                activity={m.role === "plan" ? activity : undefined}
                openCanvasSkillId={openCanvasSkillId}
                regenerable={m.id === regenerableId}
                onToggleCanvas={onToggleCanvas}
                onLogClick={onLogClick}
                onApproval={onApproval}
                onWidgetAction={onWidgetAction}
                onRegenerate={onRegenerate}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {thinking && (
              <ThinkingIndicator
                activity={activity ?? null}
                startedAt={thinkingSince}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
      <MessageNavigationRail
        messages={messages}
        viewportRef={scrollRef}
        contentRef={contentRef}
        visible={navigationVisible}
        onNavigate={(atLiveEdge) => {
          followOutputRef.current = atLiveEdge;
        }}
      />
    </div>
  );
}
