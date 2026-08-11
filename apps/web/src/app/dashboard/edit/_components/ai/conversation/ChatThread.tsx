'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Check,
  Info,
  ChevronDown,
  Eye,
  EyeOff,
  ShieldQuestion,
  X,
  CornerUpLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SKILLS } from '../skills/registry';
import Markdown from './Markdown';
import { PolarisGlyph } from '../PolarisMark';
import { WidgetHost } from '@magic-resume/genui';
import { WIDGETS } from '../widgets/registry';
import type { ApprovalRequest, ChatMessage, SkillId } from '../types';
import type { WidgetActionResult } from '@magic-resume/genui/contract';
import ActivityOrb from './ActivityOrb';
import { activityLabelKey, type AgentActivity } from './agentActivity';

type ApprovalDecision = (msgId: string, approved: boolean) => void;

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
function ThinkingIndicator({ activity }: { activity: AgentActivity | null }) {
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
      className="flex items-center gap-2 text-neutral-200"
    >
      {/* 形态 + 文案都随真实活动走：读取简历和汇总评分不再长一个样。 */}
      <ActivityOrb activity={state} />
      <span className="ai-narrate text-xs font-medium">{t(activityLabelKey(state))}</span>
    </motion.div>
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
 * A live review checklist (the analyze todolist). The agent ticks each step —
 * 读取简历 → 每个角色评审 → 汇总评分 — as its backend progress events land, so the
 * card is the narration of "分别 review" instead of one opaque "完成" badge. Once
 * done it doubles as the score-canvas toggle (the old exec-card affordance).
 */
/**
 * 判据：这次运行是**真正跑完**，还是被中止 / 失败了。
 *
 * 两者都会被 `consumeStream` 的收尾置成 `status: 'done'`，光看它区分不了。差异在
 * 步骤上——正常收尾会把全部步骤置为 completed，而中止时只是把 in_progress 退回
 * pending。所以"全部 completed"才是跑完；有 pending 残留的那张卡必须留在对话里，
 * 否则一次被打断的运行会无声消失，用户连"它做到哪一步停的"都看不到。
 */
/** 跑完之后停留多久再退场——让用户看见它确实完成了。 */
const PLAN_DWELL_MS = 700;

/**
 * 时间线几何。
 *
 * 这几个数**必须互相咬合**——导轨的 x 要等于标记盒中心、断口要等于图元自身高度、
 * orb 的落点要等于行高——所以集中成常量、由代码算出彼此，而不是散成一堆 Tailwind
 * arbitrary class 各写各的。上一版把 `left-[9.5px]` 和 `9.5 = 20/2 - 1/2` 的来历
 * 分开写在两处，读代码的人看不出它们是同一个数。
 */
const TL = {
  /** 一行文字的行高，也是标记盒的高度 */
  rowH: 18,
  /** 标记列宽。导轨画在它的中轴上 */
  colW: 20,
  /** 行与行之间的留白 */
  gapY: 10,
  /** 未开始 / 进行中的圆点直径 */
  dot: 8,
  /** 完成的 ✓ 尺寸 */
  check: 12,
  /** orb 换步时滑过去的时长 */
  strideMs: 380,
} as const;
/** 导轨中轴。1px 的线要压在中心上，所以再减半个线宽。 */
const TL_AXIS = TL.colW / 2 - 0.5;
/** 图元在行内的上下边界——导轨在这里让开，不糊在标记上。 */
const gapFor = (glyph: number) => ({
  top: (TL.rowH - glyph) / 2,
  bottom: (TL.rowH + glyph) / 2,
});

export function isPlanFulfilled(message: ChatMessage): boolean {
  const todos = message.todos ?? [];
  return todos.length > 0 && todos.every((t) => t.status === 'completed');
}

/** 技能清单（有 skillId、结果落在右侧画布）才退场；子代理清单没有产物，不能退场。 */
export function isRetirablePlan(message: ChatMessage): boolean {
  return message.role === 'plan' && !message.subagentName && isPlanFulfilled(message);
}

function PlanCard({
  message,
  retired,
  onToggleCanvas,
  isCanvasOpen,
  activity,
}: {
  message: ChatMessage;
  /** 已过完停留期：技能清单收成一行可点的指针，不再是卡。 */
  retired?: boolean;
  onToggleCanvas: (id: SkillId) => void;
  isCanvasOpen: boolean;
  /** agent 此刻在做哪一类活儿——决定骑在导轨上那颗 orb 的形态。 */
  activity?: AgentActivity | null;
}) {
  const { t } = useTranslation();
  const todos = message.todos ?? [];
  const total = todos.length;
  const done = todos.filter((t) => t.status === 'completed').length;
  const fulfilled = isPlanFulfilled(message);
  const finished = message.status === 'done' || fulfilled;
  const reduce = useReducedMotion() ?? false;

  // orb 落在哪一行——量出来的，不是算出来的：标签可能折行，行高就不再等距，
  // 用 index × 行高推位置迟早会错位。
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [orbTop, setOrbTop] = useState<number | null>(null);

  // 当前这一步 = 第一个未完成的。后端会同时把多步标成 in_progress，只认第一个，
  // 否则三处一起发光就读成「三件事在并行」，而实际上只是状态没细分。
  // （放在早退分支之前，因为下面那个 hook 依赖它——hooks 不能在 return 之后。）
  const activeIndex = todos.findIndex((x) => x.status !== 'completed');
  /** 已走完的行数。-1 表示一条未完成的都没有，即全部完成。 */
  const doneUpTo = activeIndex === -1 ? total : activeIndex;

  // useLayoutEffect：位置必须在绘制前写进 transform，否则 orb 会先在第一行闪一帧
  // 再跳到当前行。
  useLayoutEffect(() => {
    if (finished || activeIndex < 0) {
      setOrbTop(null);
      return;
    }
    const el = itemRefs.current[activeIndex];
    setOrbTop(el ? el.offsetTop : null);
  }, [activeIndex, finished, total]);

  // 技能清单跑完并过了停留期 → 收成一行可点的指针。
  //
  // 它必须留下点什么：右侧那份报告没有别的入口了——实时画布会把它顶掉，而“再加一
  // 颗头部按钮”被否掉。时间线上留一条指针既不是卡也不是新控件，位置还正好在这次
  // 运行发生的地方。
  if (retired) {
    return (
      <button
        type="button"
        onClick={() => onToggleCanvas(message.skillId ?? 'analyze')}
        className="group flex items-center gap-2 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300 cursor-pointer"
      >
        <Check size={11} className="shrink-0 text-neutral-600" />
        <span className="truncate">{message.content || t('aiLab.chat.taskList')}</span>
        <span className="shrink-0 text-sky-400/70 transition-colors group-hover:text-sky-300">
          {isCanvasOpen ? t('aiLab.chat.collapse') : t('aiLab.chat.view')}
        </span>
      </button>
    );
  }

  // 子代理跑完 → 降成一行日志。它没有右侧产物，整张卡留着只是噪音；但完全抹掉
  // 又会让"起过一个子代理"这件事无迹可寻，所以留一行。
  if (message.subagentName && finished) {
    const name =
      message.subagentName !== '子代理' && message.subagentName !== 'general-purpose'
        ? ` · ${message.subagentName}`
        : '';
    return (
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <Check size={11} className="shrink-0 text-neutral-600" />
        <span className="truncate">
          {t('aiLab.chat.subagent')}
          {name}
        </span>
      </div>
    );
  }

  return (
    // AI-native 的 ambient activity（skill: ai-native-ui-design）：不用进度条、不用
    // 「Agent working…」标签，让**正在被处理的那一步自己发光**。上一版把卡片扒光后
    // 五行长得一模一样、只差颜色深浅，等于把"AI 此刻在哪儿"这条最重要的信息扔了。
    <div className="flex items-start">
      <div className="min-w-[240px] max-w-sm">
        {/* 计数右对齐：它是行尾的说明，不是标题旁的徽章。进度已经由导轨承载，
            这里只补一个"总共多少步"——长清单里那是唯一说得出总量的地方。 */}
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="min-w-0 truncate font-medium text-neutral-300">
            {message.subagentName ? (
              <>
                <span className="text-sky-400">{t('aiLab.chat.subagent')}</span>
                {message.subagentName !== '子代理' && message.subagentName !== 'general-purpose'
                  ? ` · ${message.subagentName}`
                  : ''}
              </>
            ) : (
              message.content || t('aiLab.chat.taskList')
            )}
          </span>
          {finished ? (
            <Check size={12} className="shrink-0 text-emerald-400" />
          ) : total > 0 ? (
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-600">
              {done}/{total}
            </span>
          ) : (
            <BreathGlyph size={11} className="text-sky-400/70" />
          )}
        </div>

        {/* 导轨由每一行**自己**画出与相邻标记之间的那一小段，而不再是 <ul> 的背景渐变。
            旧写法里导轨画在容器最左侧、标记被 pl-3.5 推到 14px 之外，两套坐标系，
            那条线从设计上就不可能穿过任何一个点——量出来差 16px。现在线段的 x 直接
            由标记盒宽度算出（TL_AXIS），穿过是**构造**出来的，不是调出来的。
            断口取各自图元的实际高度（✓ 12px / 圆点 8px），线在标记处让开。 */}
        <ul className="relative mt-2.5">
          {/* 骑在导轨上的那颗 orb —— 这张卡最想说的一句话。
              它不是"第三种标记"，而是 **agent 本人站在计划的哪一级台阶上**：形态随
              activity 变（读简历 / 评估 / 干活各不相同），位置随进度往下滑。这样一颗
              球同时回答了「在做什么」和「做到哪儿」，而计数和导轨都只回答后者。
              落点是量出来的（li.offsetTop），标签折行也不会错位；位移只动 transform，
              交给合成器，流式那几帧再忙也不掉帧。 */}
          {orbTop !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-10 grid place-items-center"
              style={{
                left: 0,
                top: 0,
                width: TL.colW,
                height: TL.rowH,
                transform: `translateY(${orbTop}px)`,
                transition: reduce ? undefined : `transform ${TL.strideMs}ms cubic-bezier(0.22,1,0.36,1)`,
              }}
            >
              <ActivityOrb activity={activity ?? 'working'} />
            </span>
          )}
          {todos.map((todo, i) => {
            const isActive = !finished && i === activeIndex;
            const isDone = todo.status === 'completed';
            const ridden = isActive && orbTop !== null;
            const gap = gapFor(isDone ? TL.check : TL.dot);
            // 一个接头由「上一行的下半段 + 本行的上半段」拼成，两者必须同色，
            // 所以都用「上一行是否已完成」来判定。
            const linkAboveDone = i - 1 < doneUpTo;
            const linkBelowDone = i < doneUpTo;
            return (
              <li
                key={`${todo.content}-${i}`}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                aria-current={isActive ? 'step' : undefined}
                className="relative flex gap-2"
                style={{ paddingBottom: i === total - 1 ? 0 : TL.gapY }}
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-0 transition-colors duration-150',
                      linkAboveDone ? 'bg-sky-400/45' : 'bg-neutral-800'
                    )}
                    style={{ left: TL_AXIS, width: 1, height: gap.top }}
                  />
                )}
                {i < total - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-0 transition-colors duration-150',
                      linkBelowDone ? 'bg-sky-400/45' : 'bg-neutral-800'
                    )}
                    style={{ left: TL_AXIS, width: 1, top: gap.bottom }}
                  />
                )}
                {/* 固定 20×18 的标记盒：三种状态占位完全相同，标签左缘才能齐平。
                    旧写法把 12px 的 ✓ 和 6px 的圆点直接并排塞进 flex，宽度不等，
                    量出来首行标签比其余行右移 12px。 */}
                <span
                  className="relative grid shrink-0 place-items-center"
                  style={{ width: TL.colW, height: TL.rowH }}
                >
                  {isDone ? (
                    // 打勾是这张卡上唯一"有事发生"的瞬间，给它一个极短的落定：
                    // 只动 scale/opacity，不弹跳。
                    <motion.span
                      initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex"
                    >
                      <Check size={TL.check} className="text-neutral-500" />
                    </motion.span>
                  ) : (
                    // 当前行的点被 orb 盖住了，就别再画一颗——两颗同心圆只会糊在一起。
                    !ridden && (
                      <span
                        className={cn(
                          'rounded-full transition-colors duration-150',
                          isActive ? 'step-dot-active bg-sky-400' : 'border border-neutral-700'
                        )}
                        style={{ width: TL.dot, height: TL.dot }}
                      />
                    )
                  )}
                </span>
                <span
                  className={cn(
                    'min-w-0 text-[12px] transition-colors duration-150',
                    isDone
                      ? 'text-neutral-500'
                      : isActive
                        ? 'step-text-active text-sky-100'
                        : 'text-neutral-600'
                  )}
                  style={{ lineHeight: `${TL.rowH}px` }}
                >
                  {todo.content}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Human-in-the-loop approval prompt. The assistant asks before a sensitive action;
 * the user must allow / deny before it continues.
 */
function ApprovalCard({
  message,
  onApproval,
}: {
  message: ChatMessage;
  onApproval?: ApprovalDecision;
}) {
  const { t } = useTranslation();
  const a = message.approval as ApprovalRequest | undefined;
  if (!a) return null;
  const decide = (approved: boolean) => onApproval?.(message.id, approved);

  return (
    <div className="flex items-start">
      <div className="min-w-[260px] max-w-md rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3.5">
        <div className="flex items-start gap-2 text-[13px] text-sky-100 leading-relaxed">
          <ShieldQuestion size={15} className="text-sky-400 shrink-0 mt-0.5" />
          <span className="flex-1">{message.content || t('aiLab.chat.approval.defaultMessage')}</span>
        </div>
        {a.status === 'pending' ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => decide(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 px-3 py-1.5 text-xs font-medium text-sky-100 transition-colors cursor-pointer"
            >
              <Check size={12} />
              {t('aiLab.chat.approval.allow')}
            </button>
            <button
              type="button"
              onClick={() => decide(false)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={12} />
              {t('aiLab.chat.approval.deny')}
            </button>
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
            {a.status === 'expired' ? (
              <>
                <X size={11} />
                {t('aiLab.widgets.form.expired')}
              </>
            ) : a.status === 'denied' ? (
              <>
                <X size={11} />
                {t('aiLab.chat.approval.denied')}
              </>
            ) : a.readState === 'read' ? (
              <>
                <Check size={11} className="text-emerald-500/80" />
                {t('aiLab.chat.approval.read')}
              </>
            ) : a.readState === 'reading' ? (
              <>
                <BreathGlyph size={11} className="text-sky-400/70" />
                <span className="ai-narrate">{t('aiLab.chat.approval.reading')}</span>
              </>
            ) : (
              <>
                <Check size={11} className="text-emerald-500/80" />
                {t('aiLab.chat.approval.allowed')}
              </>
            )}
          </div>
        )}
      </div>
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
            className="mt-1.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap border-l border-white/[0.07] pl-3 text-[12px] leading-relaxed text-neutral-500"
          >
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  message,
}: {
  message: ChatMessage;
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
    <div className="flex items-start">
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
        <Markdown>{message.content ?? ''}</Markdown>
        {message.streamed && message.status === 'running' && (
          <span className="ai-breath inline-block w-[3px] h-[0.95em] translate-y-[2px] ml-0.5 bg-sky-400/80 rounded-[1px]" />
        )}
      </div>
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
};

export default function ChatThread({ messages, onToggleCanvas, openCanvasSkillId, onLogClick, onApproval, onWidgetAction, thinking, activity }: ChatThreadProps) {
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
            ) : m.role === 'plan' ? (
              <PlanCard
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
              <Bubble message={m} />
            )}
          </motion.div>
          );
        })}
        </AnimatePresence>
        <AnimatePresence>
          {thinking && <ThinkingIndicator activity={activity ?? null} />}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
