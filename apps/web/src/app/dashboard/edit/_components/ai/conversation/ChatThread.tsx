'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Check,
  Info,
  ChevronDown,
  Eye,
  EyeOff,
  CornerUpLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SKILLS } from '../skills/registry';
import Markdown from './Markdown';
import { PolarisGlyph } from '../PolarisMark';
import { WidgetHost } from '@magic-resume/genui';
import { WIDGETS } from '../widgets/registry';
import type { ApprovalRequest, ChatMessage, SkillId } from '../types';
import {
  Icon,
  ToolChips,
  ApprovalCard as ApprovalPager,
  type ApprovalQuestion,
} from '@magic-resume/genui/beautiful';
import { toToolChipRows } from './toolTrace';
import TasksCard, {
  PLAN_DWELL_MS,
  isPlanFulfilled,
  isRetirablePlan,
} from './TasksCard';
import type { WidgetActionResult } from '@magic-resume/genui/contract';
import ActivityOrb from './ActivityOrb';
import { activityLabelKey, type AgentActivity } from './agentActivity';

/** 审批卡上的一页答完了。一次中断可以带多个动作，所以要带页号。 */
type ApprovalDecision = (msgId: string, pageIndex: number, approved: boolean) => void;

/**
 * 思维链 → 可读的行。
 *
 * 推理模型（gpt-5.6 一类）回传的是一串 `**Planning resume summary revision**` 这样的
 * 小标题，之间隔着空行。原来整段按 `whitespace-pre-wrap` 直出，于是屏幕上是一列带着
 * 星号、彼此隔开一大截的英文——星号是给 markdown 看的，不是给人看的。
 *
 * 不上 markdown 渲染器：思维链只有「标题行 + 普通行」两种形态，为它拖一整套解析器
 * 进来（还要处理列表、代码块、表格）不划算。空行丢掉，间距交给 CSS。
 */
function reasoningLines(text: string): { text: string; strong: boolean }[] {
  return text
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const bold = /^\*\*(.+?)\*\*$/.exec(line);
      return bold
        ? { text: bold[1], strong: true }
        : { text: line.replace(/\*\*(.+?)\*\*/g, '$1'), strong: false };
    });
}

/**
 * Bot-side avatar. Consecutive bot messages share one avatar: only the first in a
 * run renders it, the rest pass `show={false}` and get a spacer so their text stays
 * aligned under the same column.
 */
/**
 * 「呼吸叙述」的最小单元（docs/specs/ai-working-motion）：一枚随全局心跳呼吸的
 * 北极星，替换线程里所有 spinner —— 系统只有一个心跳，不是一堆各转各的零件。
 */
function BreathGlyph({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('ai-breath inline-flex shrink-0', className)} aria-hidden="true">
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
/** 已等待的秒数，取自 Beautiful UI 的 LoadingState（等宽数字，避免逐秒抖动）。 */
function Elapsed({ startedAt }: { startedAt?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return (
    <span className="font-mono text-[11px] tabular-nums text-neutral-500">
      {s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}
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
  const state = activity ?? 'thinking';
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
            'linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer-text 1.4s linear infinite',
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
 * 这一轮动过哪些工具。
 *
 * 此前除 `read_resume` 外的工具调用在界面上**完全不可见**——只改了那颗 orb 的形态，
 * 跑完就没了；用户回头看不出「它到底做了什么」。这张卡把一轮里的调用收成一组，
 * 可展开、可回看。
 */
function ToolTrace({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return null;
  const running = message.status === 'running';
  return (
    <div className="w-full max-w-lg">
      <ToolChips
        rows={toToolChipRows(calls, t)}
        working={running}
        title={t('aiLab.tools.count', { count: calls.length })}
      />
    </div>
  );
}

/**
 * A tool activity line (e.g. read_resume) with a pending → done transition. Muted and
 * indented to sit under the bot avatar column; breathing star + narrated text while
 * running, subtle check when finished.
 */
function ActivityLine({ message }: { message: ChatMessage }) {
  const running = message.status === 'running';
  return (
    <div className="flex items-center gap-2 text-[11px] text-neutral-500">
      {running ? (
        <ActivityOrb activity="working" />
      ) : (
        <Check size={11} className="shrink-0 text-neutral-600" />
      )}
      <span className={cn('truncate', running && 'ai-narrate')}>{message.content}</span>
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
  const running = message.status === 'running';
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
            {t('aiLab.chat.done')}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className={cn('text-xs text-neutral-500 truncate', running && 'ai-narrate')}>
          {running ? t('aiLab.chat.running') : skill.doneSummary}
        </span>
        {clickable && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-400 bg-sky-500/10 group-hover:bg-sky-500/20 rounded-full px-2.5 py-1 shrink-0 transition-colors">
            {isCanvasOpen ? <EyeOff size={12} /> : <Eye size={12} />}
            {isCanvasOpen ? t('aiLab.chat.collapse') : t('aiLab.chat.view')}
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
        <div className="min-w-[260px] max-w-sm rounded-2xl bg-neutral-900 px-4 py-3.5">{body}</div>
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

  const allow = t('aiLab.chat.approval.allow');
  const deny = t('aiLab.chat.approval.deny');

  /** 已答的那一页显示什么。读简历还有「正在读 / 已读取」两级进度。 */
  const answeredOf = (a: ApprovalRequest): string | undefined => {
    if (a.status === 'pending') return undefined;
    if (a.status === 'expired') return t('aiLab.widgets.form.expired');
    if (a.status === 'denied') return t('aiLab.chat.approval.denied');
    if (a.readState === 'read') return t('aiLab.chat.approval.read');
    if (a.readState === 'reading') return t('aiLab.chat.approval.reading');
    return t('aiLab.chat.approval.allowed');
  };

  const questions: ApprovalQuestion[] = pages.map((a) => ({
    q: a.question || message.content || t('aiLab.chat.approval.defaultMessage'),
    type: 'radio',
    options: [allow, deny],
    answered: answeredOf(a),
  }));

  return (
    <div className="flex items-start">
      <ApprovalPager
        questions={questions}
        // 会话从本地记录恢复时后端线程早已回收，续跑必失败——那时整张卡只能读不能点。
        disabled={pages.every((a) => a.status === 'expired')}
        labels={{
          previous: t('aiLab.chat.approval.previous'),
          next: t('aiLab.chat.approval.next'),
          send: t('aiLab.chat.approval.send'),
          goTo: t('aiLab.chat.approval.goTo'),
          freeText: '',
          freeTextAria: '',
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
  const tone = message.tone ?? 'ok';
  const toneStyle = {
    ok: { text: 'text-neutral-500', icon: 'text-emerald-500/80', Icon: Check },
    info: { text: 'text-sky-400/85', icon: 'text-sky-400/70', Icon: Info },
    warn: { text: 'text-amber-500/90', icon: 'text-amber-500/80', Icon: AlertCircle },
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
      title={t('aiLab.chat.backToChange')}
      className={`${className} hover:text-neutral-300 transition-colors cursor-pointer w-full text-left`}
    >
      {body}
    </button>
  );
}

/**
 * 一轮的思考过程（推理模型回传的思维链）。
 *
 * **有就展示、没有就不展示**：不回传思维链的模型（OpenAI o 系列）这条通道天然为空，
 * 那时整块不渲染——不留一个点开是空的壳子。
 *
 * 默认收起：思考是过程，正文才是结论。想看的人点开，不想看的人不该被几百字的
 * 内心独白挡住答案。生成中标题带呼吸，读作「还在想」。
 */
function ReasoningBlock({ text, running }: { text: string; running: boolean }) {
  const { t } = useTranslation();
  /**
   * `null` = 跟随状态，布尔 = 用户手动钉住过。
   *
   * 展开与否不是一个常量，取决于此刻还有没有别的东西可看：思考进行中，思维链**就是
   * 屏幕上唯一在发生的事**，收起来只剩一行「正在思考…」，等于把唯一的进展藏了；
   * 正文一开始它就降级成过程，该让位给结论。所以默认值跟着 running 走。
   *
   * 但用户点过之后就以他的意思为准——自动行为可以有主张，不能推翻明确的操作。
   */
  const [pinned, setPinned] = useState<boolean | null>(null);
  const open = pinned ?? running;
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * 生成中让视口跟住最新一段思考。
   *
   * 只在**用户本来就贴着底部**时才跟——他往上翻是在读前面的内容，这时候把他拽回
   * 底部是最讨嫌的一类"贴心"。48px 的容差覆盖行高抖动。
   */
  useEffect(() => {
    if (!open || !running) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [text, open, running]);
  return (
    <div className="mb-2">
      {/* 思考中，这一行**就是**线程尾那个状态指示器——同一颗 orb、同一句文案、同一组
          字号间距（见 ThinkingIndicator）。气泡是收到首个思考块才建的，那一刻指示器
          退场、这里接上；两边长得不一样的话，交接就成了「换了个东西」而不是「同一个
          东西长出了内容」。用户要的是并存：上面状态，下面思维链。

          思考结束（正文开始）它降级为一个可展开的入口：orb 换成 chevron，链收起。
          那时状态由正文自己承担，再留一颗球在这儿就是重复叙事。 */}
      {/* 前导图元固定占 20px 见方，两态叠在同一个格子里交叉淡入淡出。
          尺寸/间距/字号/字重四项在两态之间**全部不变**，只有颜色过渡——否则
          「思考完」那一下是 orb 换 chevron(20→12)、gap(8→6)、字号(12→11) 一起跳，
          标签会横向弹 10px，那才是真正扎眼的地方。
          orb 只在 running 时挂载：留着一颗 opacity-0 的球，等于让每条读完的消息
          都在后台跑一条 canvas RAF。 */}
      <button
        type="button"
        onClick={() => setPinned(!open)}
        aria-expanded={open}
        className={cn(
          'group inline-flex items-center gap-2 text-xs font-medium transition-colors duration-200 cursor-pointer',
          running ? 'text-neutral-200' : 'text-neutral-500 hover:text-neutral-300',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          {/* initial={false}：首次挂载时不演入场——这一刻它正接替尾部指示器那颗球，
              淡入就等于原地闪一下。之后的两态互换才走 180ms 交叉淡。 */}
          <AnimatePresence initial={false}>
            {running ? (
              <motion.span
                key="orb"
                className="col-start-1 row-start-1 flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ActivityOrb activity="thinking" />
              </motion.span>
            ) : (
              <motion.span
                key="chevron"
                className="col-start-1 row-start-1 flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ChevronDown
                  size={12}
                  className={cn('transition-transform', open && 'rotate-180')}
                />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className={cn(running && 'ai-narrate')}>
          {running ? t(activityLabelKey('thinking')) : t('aiLab.reasoning.done')}
        </span>
      </button>
      {/* 0fr → 1fr 收放：不动 height，交给 grid 自己算 */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {/* 封顶 + 自己滚。思维链可以很长，任其铺开会把结论顶出视野——而结论才是
              用户要的。不用 scrollbar-hide：一个能滚的区域藏掉滚动条就等于没了可滚的提示。 */}
          <div
            ref={scrollRef}
            className="mt-1.5 max-h-[200px] overflow-y-auto border-l border-white/[0.07] pl-3 text-[12px] leading-relaxed text-neutral-500"
          >
            {reasoningLines(text).map((line, i) => (
              <p key={i} className={cn('my-1 first:mt-0 last:mb-0', line.strong && 'font-medium text-neutral-400')}>
                {line.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  message,
  onRegenerate,
}: {
  message: ChatMessage;
  /** 只有最后一条助手回复拿得到，见 `MessageActions`。 */
  onRegenerate?: () => void;
}) {
  if (message.role === 'user') {
    const skill = message.skillId ? SKILLS[message.skillId] : null;
    const SkillIcon = skill?.icon;
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-neutral-800 text-neutral-100 px-4 py-2.5 text-sm leading-relaxed">
          {skill && (
            <span className="inline-flex items-center gap-1 align-middle mr-2 rounded-md bg-neutral-700/70 px-1.5 py-0.5">
              {SkillIcon && <SkillIcon size={11} className={skill.accent} />}
              <span className={cn('text-[11px] font-medium', skill.accent)}>{skill.name}</span>
            </span>
          )}
          {message.attachment && (
            <Icon name="attach" size={12} className="mr-1.5 inline-block align-[-1px] text-neutral-400" />
          )}
          {message.quote && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-sunk px-2.5 py-2 text-left ring-1 ring-white/[0.05]">
              <CornerUpLeft size={12} className="mt-0.5 shrink-0 text-sky-400/80" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium text-neutral-500">{message.quote.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-neutral-300">
                  {message.quote.text}
                </div>
              </div>
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }
  return (
    // `group/msg` 命名而不是裸 `group`：这棵树里已经有别的 group（技能卡、工具行），
    // 裸 group 会让最近的那个祖先赢，操作行于是跟着无关的元素亮起来。
    <div className="group/msg flex items-start">
      {/* 限宽。用户气泡是 max-w-[80%] 右对齐，助手正文原本 flex-1 吃满整列——
          一边缩着一边顶到边，读起来就是失衡，长句还会一路铺到用户气泡那一侧下方。
          给助手一个略宽于用户的上限：它是长文，但不该无边界。 */}
      {/* pt-1 是给正文做光学对齐的；有思考头时不能要——它会把那一行压低 4px，
          而这一行必须和它接替的尾部指示器落在同一条基线上。 */}
      <div
        className={cn(
          'min-w-0 max-w-[88%] text-sm text-neutral-200 leading-relaxed',
          !message.reasoning && 'pt-1',
        )}
      >
        {message.reasoning && (
          <ReasoningBlock
            text={message.reasoning}
            running={message.status === 'running' && !message.content}
          />
        )}
        {/* 一种渲染方式、一种手感。这里原来给非流式的助手台词加了 JS 定时器的伪打字
            （24ms/字），跟真流式并存就是两种节奏；而 brief §3 明确要删掉这类假动效
            ——它模拟的是并没有在发生的工作。光标同理挂回全局心跳。 */}
        {/* 光标由 Markdown 自己发：放在这里它是块级 `<p>` 的兄弟节点，会掉到段落下面
            单独占一行，而它该跟在最后一个字后面。 */}
        <Markdown streaming={message.streamed && message.status === 'running'}>
          {message.content ?? ''}
        </Markdown>
        {/* 取自 Beautiful UI 的 StreamingText：一段回复写完之后该能被拿走。
            此前只能手动框选——而模型给的建议、改写后的段落，用户十有八九是要复制的。
            只在写完后出现：流式途中出现等于让人去点一个还在长的东西。 */}
        {message.status === 'done' && (message.content ?? '').trim() && (
          <MessageActions text={message.content ?? ''} onRegenerate={onRegenerate} />
        )}
      </div>
    </div>
  );
}

/**
 * 一条助手回复写完之后的操作行。
 *
 * 形态取自 Beautiful UI 的 StreamingText——但**只保留复制**：重试要重发这一轮（会
 * 二次计费且可能覆盖已接受的改动），赞踩要有反馈通道，两者都还没有。做一个点了没反应
 * 的按钮，比没有这个按钮更糟。
 */
function MessageActions({ text, onRegenerate }: { text: string; onRegenerate?: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    // 静息时透明但**仍占位**：改成 hidden 会让整条消息在鼠标划过时高度跳一下，比一直
    // 显示还吵。`focus-within` 是给键盘的——只挂 hover 等于把这两个动作从键盘上删掉。
    <div
      className={cn(
        'mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150',
        'group-hover/msg:opacity-100 focus-within:opacity-100',
      )}
    >
      <button
        type="button"
        aria-label={t('aiLab.chat.copy')}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors',
          copied ? 'text-emerald-400' : 'text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-300',
        )}
      >
        {copied ? <Check size={12} /> : <Icon name="copy" size={12} />}
        {copied ? t('aiLab.chat.copied') : t('aiLab.chat.copy')}
      </button>
      {/* 只挂在最后一条回复上。给历史里任何一条都配重答，等于允许把对话改成一棵树，
          而这个界面只画得出一条线。 */}
      {onRegenerate && (
        <button
          type="button"
          aria-label={t('aiLab.chat.regenerate')}
          onClick={onRegenerate}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
        >
          <Icon name="retry" size={12} />
          {t('aiLab.chat.regenerate')}
        </button>
      )}
    </div>
  );
}

type ChatThreadProps = {
  messages: ChatMessage[];
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

export { isPlanFulfilled, isRetirablePlan };

export default function ChatThread({ messages, onToggleCanvas, openCanvasSkillId, onLogClick, onApproval, onWidgetAction, thinking, activity, onRegenerate }: ChatThreadProps) {
  // 只有最后一条写完的助手回复能重答。这一轮还在跑的时候不给——重答会把它顶掉，
  // 而用户此刻看到的正是它在写。
  const regenerableId = (() => {
    if (!onRegenerate || thinking) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'assistant') return m.status === 'done' ? m.id : null;
      if (m.role === 'user') return null;
    }
    return null;
  })();
  // 这一轮从什么时候开始等的。`thinking` 由 false → true 的那一刻记一次，之后整轮不变
  // ——每次重渲都取 Date.now() 的话，计时永远显示 0。
  const [thinkingSince, setThinkingSince] = useState<number | undefined>(undefined);
  useEffect(() => {
    setThinkingSince(thinking ? Date.now() : undefined);
  }, [thinking]);

  const endRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    // reduce 下也别平滑滚动——自动滚动是这套界面里最容易让人不适的一个动作。
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages, thinking, reduceMotion]);

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
  const [retired, setRetired] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const pending = messages.filter((m) => isRetirablePlan(m) && !retired.has(m.id));
    if (!pending.length) return;
    const timers = pending.map((m) =>
      window.setTimeout(() => {
        setRetired((prev) => new Set(prev).add(m.id));
      }, PLAN_DWELL_MS)
    );
    return () => timers.forEach((tm) => window.clearTimeout(tm));
  }, [messages, retired]);


  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        {/* New messages rise + fade in (Claude-desktop style 由下到上); keyed by id
            so only freshly-mounted turns animate, never re-renders of existing ones.
            外层 AnimatePresence 是 exit 能播的前提——没有它,流式过程中一条消息被
            替换（activity → assistant 之类）就是硬切,写了 exit 也等于没写。 */}
        <AnimatePresence initial={false}>
        {messages.map((m) => {
          // 思考链先于正文到达时，这条气泡是**接替**尾部指示器的：它挂载的位置正是
          // 指示器此刻所在的位置，头部也和它长得一样。再演一遍「由下升入」，同一颗
          // orb 就等于在原地动了一次——那一下的不顺就是从这儿来的。
          const takesOverThinking = m.role === 'assistant' && !!m.reasoning && !m.content;
          // 自己刚发出去的那句，动作要比别的重一点：它是**你按下回车的回执**。
          // 起始 scale 压到 0.92、原点钉在右下角——也就是输入框所在的方向——读起来
          // 就是从输入框那儿冒出来落进对话，而不是凭空淡入。
          const isUser = m.role === 'user';
          return (
          <motion.div
            key={m.id}
            initial={
              takesOverThinking
                ? false
                : isUser
                  ? { opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.92 }
                  : { opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{
              duration: reduceMotion ? 0 : isUser ? 0.26 : 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={isUser ? { transformOrigin: '100% 100%' } : undefined}
          >
            {m.role === 'exec' ? (
              <ExecCard
                message={m}
                onToggleCanvas={onToggleCanvas}
                isCanvasOpen={openCanvasSkillId === m.skillId}
              />
            ) : m.role === 'log' ? (
              <LogLine message={m} onLogClick={onLogClick} />
            ) : m.role === 'activity' ? (
              <ActivityLine message={m} />
            ) : m.role === 'approval' ? (
              <ApprovalCard message={m} onApproval={onApproval} />
            ) : m.role === 'tools' ? (
              <ToolTrace message={m} />
            ) : m.role === 'plan' ? (
              <TasksCard
                message={m}
                retired={retired.has(m.id)}
                onToggleCanvas={onToggleCanvas}
                isCanvasOpen={openCanvasSkillId === (m.skillId ?? 'analyze')}
                activity={activity}
              />
            ) : m.role === 'widget' ? (
              m.widget ? (
                <div className="flex items-start">
                  <WidgetHost
                    registry={WIDGETS}
                    instance={m.widget}
                    onAction={onWidgetAction ?? (() => {})}
                  />
                </div>
              ) : null
            ) : (
              <Bubble
                message={m}
                onRegenerate={m.id === regenerableId ? onRegenerate : undefined}
              />
            )}
          </motion.div>
          );
        })}
        </AnimatePresence>
        <AnimatePresence>
          {thinking && (
            <ThinkingIndicator activity={activity ?? null} startedAt={thinkingSince} />
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
