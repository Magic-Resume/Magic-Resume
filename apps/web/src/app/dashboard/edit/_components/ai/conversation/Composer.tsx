'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, CornerUpLeft, Mic, Plus, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SKILLS, SKILL_LIST } from '../skills/registry';
import type { SkillId } from '../types';
import ModelStrengthPicker from './ModelStrengthPicker';
import ModeDotField from './ModeDotField';
import ModePicker from './ModePicker';
import ProUpgradeBanner from './ProUpgradeBanner';
import { useSpeechInput } from './useSpeechInput';
import {
  AGENT_MODES,
  isSkillAvailableInMode,
  modeLoadingKey,
  modePlaceholderKey,
  modeReadyKey,
  type AgentMode,
} from './modes';

/**
 * 文本区的高度区间。
 *
 * 66px 起（约两行半）不是拍脑袋：控件行 38px 固定，而设计稿里文字区与控件行的比例是
 * 1.14——之前单行 24px 让这个比例倒挂成 0.63，控件行比写字的地方还高 1.6 倍，观感上
 * 就成了「按钮怎么这么大」。加高文字区把权重还回去，按钮一个像素都不用动。
 * 上限取 min 的两倍（同设计稿）。
 */
const MIN_TEXTAREA_HEIGHT = 66;
const MAX_TEXTAREA_HEIGHT = 132;
/** 切模式后停在「正在进入…」多久才翻成「已就绪」。 */
const MODE_SETTLE_MS = 620;
// useLayoutEffect writes the height before paint (no clipped frame) but warns
// during SSR — fall back to useEffect on the server.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** A snippet lifted from the canvas ("自定义 / 问 AI"), shown as a quoted chip above the input. */
export type QuotedContext = { label: string; text: string };

type ComposerProps = {
  /** Run a skill picked via `/`, carrying whatever the user typed after the chip. */
  onRunSkill: (id: SkillId, text: string) => void;
  onSend: (text: string) => void;
  /** When set, the input shows a quoted chip and sending routes the instruction here. */
  quotedContext?: QuotedContext | null;
  onSendWithContext?: (text: string) => void;
  onClearQuoted?: () => void;
  disabled?: boolean;
  /** 生成中:发送按钮原位变成停止按钮(ChatGPT/Claude 式),不再另起浮动胶囊。 */
  running?: boolean;
  onStop?: () => void;
  /** 用户在对话里直接投一份旧简历 PDF。缺了它,「我有份旧简历」只能被打发去别处。 */
  onAttachPdf?: (file: File) => void;
  /** 当前模式 —— 提到会话层，因为真正的闸门在 AiChatShell 的运行逻辑里。 */
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  /** 对话已开始。升级条只属于欢迎态：一旦开聊，它就是压在输入框下面的一条广告。 */
  conversationStarted?: boolean;
};

/**
 * 底部控件行的共用胶囊底子。设计稿是 58px（848px 宽的独立展示件），按 ×0.7 缩到
 * 面板节奏后是 42px，实际用下来仍偏重，最终定在 38px——控件行、麦克风、发送键
 * 全部同高，混排不同高度比尺寸本身更显怪。
 */
const PILL =
  'inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] ' +
  'bg-white/[0.045] text-[14px] text-neutral-100 transition-colors hover:bg-white/[0.075] ' +
  'disabled:opacity-40 disabled:hover:bg-white/[0.045] cursor-pointer';

/** 模式条左侧那颗 3×3 点阵。随模式换形，和点阵场的排布呼应。 */
function ModeGlyph({ mode }: { mode: AgentMode }) {
  const round = mode === 'plan';
  return (
    <span
      aria-hidden
      className="grid shrink-0 grid-cols-3 gap-[2px] transition-transform duration-300"
      style={{
        transform:
          mode === 'plan' ? 'rotate(45deg) scale(0.92)' : mode === 'ask' ? 'scaleX(1.08)' : 'none',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          className={cn('block h-[3px] w-[3px] bg-current', round ? 'rounded-full' : 'rounded-[1px]')}
        />
      ))}
    </span>
  );
}

function Composer({
  onRunSkill,
  onSend,
  quotedContext,
  onSendWithContext,
  onClearQuoted,
  onAttachPdf,
  disabled,
  running,
  onStop,
  mode,
  onModeChange,
  conversationStarted,
}: ComposerProps) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  // The skill picked from `/`: shown as a highlighted chip in the input. Selecting
  // does NOT launch — the user keeps typing context, then Enter runs it (Claude-style).
  const [activeSkill, setActiveSkill] = useState<SkillId | null>(null);
  // 切模式后短暂停在「正在进入…」。这不是假装在加载——模式切换确实改变了后续每一轮
  // 的契约，给它一个可见的落定动作，比文字默默换掉更让人确信自己按到了。
  const [settling, setSettling] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeAccent = AGENT_MODES[mode].accentHex;

  const speech = useSpeechInput({
    lang: i18n.language?.startsWith('en') ? 'en-US' : 'zh-CN',
    onFinalText: (text) => {
      // 接在已有内容后面，不覆盖用户手打的部分。
      setValue((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${text}` : text));
    },
    onError: (kind) => {
      toast.error(
        kind === 'denied' ? t('aiLab.composer.voice.denied') : t('aiLab.composer.voice.failed')
      );
    },
  });

  // Auto-grow the textarea to fit its content up to MAX_TEXTAREA_HEIGHT, then
  // scroll. Measured at height:auto; a FLIP restore + reflow makes the CSS
  // height transition animate from the previous height (smooth grow/shrink).
  const autosize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const prev = el.style.height;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
    if (prev) {
      el.style.height = prev; // baseline = last height so the transition runs prev → next
      void el.offsetHeight; // commit it before the final set
    }
    el.style.height = `${next}px`;
  }, []);

  // Re-fit on every value change — typing, clearing on send, or dropping a chip/quote.
  useIsomorphicLayoutEffect(() => {
    autosize();
  }, [value, autosize]);

  useEffect(() => {
    setSettling(true);
    const timer = window.setTimeout(() => setSettling(false), MODE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  // `/` only opens the menu when no skill chip is active (one skill at a time).
  const slashActive = !activeSkill && value.startsWith('/');
  const query = slashActive ? value.slice(1).trim().toLowerCase() : '';
  const matches = slashActive
    ? SKILL_LIST.filter(
        (s) =>
          // 当前模式下跑不成的技能不进菜单：拿不到简历的「简历分析」只会跑失败，
          // 看起来像坏了，而不是像「这个模式下本来就没有它」。
          isSkillAvailableInMode(s.id, mode) &&
          (s.name.toLowerCase().includes(query) ||
            s.tagline.toLowerCase().includes(query) ||
            s.id.includes(query))
      )
    : [];
  const showSlash = slashActive && matches.length > 0;
  const activeMeta = activeSkill ? SKILLS[activeSkill] : null;
  const ActiveIcon = activeMeta?.icon;
  const canSend = !!activeSkill || !!value.trim() || !!quotedContext;
  // 发送键点亮 = 对用户输入的第一次确认。空态是描边幽灵圆，不预先承诺一个此刻不存在的动作。
  const sendLit = canSend && !disabled;

  // 模式条文案：听写 > 切换中 > 就绪。听写时把实时识别的字接在后面，
  // 省得再为它另造一块 UI——这条带子本来就是「现在处于什么状态」的位置。
  const headerLabel = speech.listening
    ? speech.interim
      ? `${t('aiLab.composer.voice.listening')} ${speech.interim}`
      : t('aiLab.composer.voice.listening')
    : t(settling ? modeLoadingKey(mode) : modeReadyKey(mode));

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  // Lift focus into the input the moment a canvas snippet is quoted in.
  useEffect(() => {
    if (quotedContext) requestAnimationFrame(() => inputRef.current?.focus());
  }, [quotedContext]);

  // Pick a skill → drop it into the input as a chip and keep the cursor for more typing.
  const chooseSkill = (id: SkillId) => {
    setActiveSkill(id);
    setValue('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = () => {
    if (slashActive) {
      const chosen = matches[highlight];
      if (chosen) chooseSkill(chosen.id);
      return;
    }
    // 说到一半直接回车:把已经上屏的话发出去,同时收掉麦克风,不要求先手动停。
    if (speech.listening) speech.stop();
    if (activeSkill) {
      onRunSkill(activeSkill, value.trim());
      setActiveSkill(null);
      setValue('');
      return;
    }
    if (quotedContext) {
      onSendWithContext?.(value.trim());
      setValue('');
      return;
    }
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // While the IME is composing (e.g. typing Chinese pinyin), Enter confirms a
    // candidate — it must NOT submit or drive the slash menu. Without this, hitting
    // Enter to pick a 候选词 fires off the message mid-typing.
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (showSlash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setValue('');
        return;
      }
    }
    // Backspace on an empty input pops the skill chip / quote (like deleting a token).
    if (e.key === 'Backspace' && value === '') {
      if (activeSkill) {
        e.preventDefault();
        setActiveSkill(null);
        return;
      }
      if (quotedContext) {
        e.preventDefault();
        onClearQuoted?.();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0">
      <div className="relative max-w-3xl mx-auto">
        <AnimatePresence>
          {showSlash && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 bottom-[calc(100%+10px)] rounded-[20px] bg-neutral-900/95 backdrop-blur-xl border border-white/[0.06] p-2 z-20 shadow-2xl shadow-black/60 origin-bottom"
            >
              <div className="px-2.5 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600">
                {t('aiLab.composer.skills')}
              </div>
              {matches.map((s, i) => {
                const Icon = s.icon;
                const active = i === highlight;
                return (
                  <button
                    key={s.id}
                    type="button"
                    // Neutral marker: which catalog event this maps to is decided
                    // in the tracking manifest, not here. The attribute name is
                    // the mark — spread because the skill id decides which one,
                    // and the set is closed (five skills, five manifest entries).
                    {...{ [`data-magic-ai-skill-${s.id}`]: '' }}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => chooseSkill(s.id)}
                    className={cn(
                      // Codex-style: compact single-line rows, quiet neutral highlight (no color block).
                      'group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left',
                      active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
                    )}
                  >
                    <span className="flex items-center justify-center w-5 h-5 shrink-0">
                      <Icon
                        size={16}
                        className={cn(
                          'transition-colors',
                          active ? 'text-neutral-200' : 'text-neutral-500 group-hover:text-neutral-400'
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1 flex items-baseline gap-2">
                      <span
                        className={cn(
                          'shrink-0 text-[13px] font-medium transition-colors',
                          active ? 'text-neutral-50' : 'text-neutral-200'
                        )}
                      >
                        {s.name}
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-neutral-500">{s.tagline}</span>
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {quotedContext && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="mb-2 flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5"
            >
              <CornerUpLeft size={13} className="mt-0.5 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                  {quotedContext.label}
                </div>
                <div className="truncate text-[12px] text-neutral-300">{quotedContext.text}</div>
              </div>
              <button
                type="button"
                onClick={onClearQuoted}
                aria-label={t('aiLab.composer.clearQuote')}
                className="shrink-0 text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 三层表面：外壳（最亮）→ 内层面板 → 凹槽输入井（最暗）。
            设计稿的绝对值不能照搬——它的页面底是中灰紫 oklch(0.251)，输入井 oklch(0.134)
            比页底更暗；我们的桌面底是 #0A0A0A(0.145)，照搬会让输入井沉进背景里看不见。
            这里保留「逐层向内变暗」的相对关系，整体抬到 desk 之上。 */}
        <div className="rounded-[30px] border border-white/[0.06] bg-gradient-to-b from-neutral-800/65 to-neutral-800/45 p-1 shadow-[0_16px_36px_-18px_rgba(0,0,0,0.7)]">
          {/* 这一层**不能**加 overflow-hidden：模式 / 模型菜单都是向上展开的，会被裁掉。
              点阵 canvas 的圆角裁剪交给模式条自己（它本来就要 overflow-hidden）。 */}
          <div className="relative rounded-[26px] bg-neutral-900/70">
            {/* 点阵层。刻意铺得比模式条高（48 > 30）：模式条底边与输入井顶部圆角之间
                那两个夹角，原先是 overflow-hidden 把 canvas 裁在模式条里够不到的死角。
                多出来的部分由 cutout 按输入井的形状挖空，井本身的观感一点不受影响。
                压在 z-0：井是半透明的，点阵必须在它下面。 */}
            <div className="absolute inset-x-0 top-0 z-0 h-[48px] overflow-hidden rounded-t-[26px]">
              <ModeDotField
                mode={mode}
                listening={speech.listening}
                cutout={{ top: 30, radius: 13 }}
              />
            </div>
            {/* 模式条。pointer-events-none 让指针穿过去交给下面的点阵 canvas——
                这一条里没有可点的东西，让路不损失任何交互。 */}
            <div
              className="pointer-events-none relative z-10 flex h-[30px] items-center gap-2.5 px-4"
              style={{ color: modeAccent }}
              aria-live="polite"
            >
              <span className="relative flex min-w-0 items-center gap-2.5">
                <ModeGlyph mode={mode} />
                {/* 上滑换字：旧的往上走、新的从下面顶上来，读作「状态推进了一格」，
                    而不是同一处文字被悄悄替换掉。
                    key 用**阶段**而不是文案本身——听写时 interim 每识别一个词
                    headerLabel 就变一次，拿文案当 key 会一路抽搐。 */}
                <span className="relative min-w-0 overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={`${mode}:${speech.listening ? 'voice' : settling ? 'settling' : 'ready'}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="block min-w-0 truncate text-[11px] font-medium tracking-[0.01em]"
                    >
                      {headerLabel}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </span>
            </div>

            {/* 凹槽输入井。@container 挂在这儿：标签的收放该看输入区自己有多宽，
                不是看视口——AI 面板宽度是可变的。 */}
            <div className="@container relative z-10 rounded-[13px_13px_26px_26px] border border-white/[0.05] bg-neutral-950/55 p-2.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.34)]">
              {/* 技能 chip 行内摆在文字前面，占位符 / 正文接着它往下写。
                  accent 色回来了：它已经不在控件行里，不再和模式胶囊争「这一行唯一
                  有颜色的东西」，而技能本身有颜色恰恰是最快认出「现在要跑什么」的方式。 */}
              <div className="flex items-start gap-2">
                <AnimatePresence initial={false}>
                  {activeMeta && (
                    <motion.button
                      key={activeMeta.id}
                      type="button"
                      onClick={() => setActiveSkill(null)}
                      aria-label={t('aiLab.composer.clearMode', { skill: activeMeta.name })}
                      title={t('aiLab.composer.clearMode', { skill: activeMeta.name })}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      // 退场不留时长。chip 是 flex 行里 shrink-0 的一项，它**占着位**
                      // 淡出 160ms、到最后一帧才被移除——于是 placeholder 先换文案，
                      // 一百多毫秒后整段文字再向左弹一下。那两拍就是看到的"卡顿"。
                      // 归零后换文案与让位发生在同一帧，只剩一次干净的位移。
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                      // mt-1 让 28px 的 chip 垂直居中对齐首行文字的中线（6px 上内边距 + 12px 半行高）
                      className="group mt-1 inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-[14px] transition-colors cursor-pointer"
                      style={{
                        color: activeMeta.accentHex,
                        background: `color-mix(in oklab, ${activeMeta.accentHex} 12%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${activeMeta.accentHex} 34%, transparent)`,
                      }}
                    >
                      {ActiveIcon && <ActiveIcon size={14} className="shrink-0" />}
                      <span className="min-w-0 truncate">{activeMeta.name}</span>
                      <X size={13} className="shrink-0 opacity-55 transition-opacity group-hover:opacity-100" />
                    </motion.button>
                  )}
                </AnimatePresence>
              <textarea
                ref={inputRef}
                rows={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={disabled}
                placeholder={
                  quotedContext
                    ? t('aiLab.composer.placeholderQuoted')
                    : activeMeta
                      ? t('aiLab.composer.placeholderSkill', { skill: activeMeta.name })
                      : t(modePlaceholderKey(mode))
                }
                className="block min-h-[66px] min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent px-1.5 pt-1.5 text-[16px] leading-[1.5] text-neutral-100 placeholder:text-neutral-500 transition-[height] duration-150 ease-out focus:outline-none disabled:opacity-50"
              />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {onAttachPdf && (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          // 清空 value：同一个文件连选两次也要能再触发一次 change。
                          e.target.value = '';
                          if (f) onAttachPdf(f);
                        }}
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => fileRef.current?.click()}
                        aria-label={t('aiLab.composer.attachPdf')}
                        title={t('aiLab.composer.attachPdf')}
                        className={cn(PILL, 'w-[38px] justify-center @[420px]:w-auto @[420px]:justify-start @[420px]:pl-3 @[420px]:pr-3.5')}
                      >
                        <Plus size={16} className="shrink-0 text-neutral-400" />
                        {/* 窄面板下退回纯图标：标签是第一个该让位的东西 */}
                        <span className="hidden @[420px]:inline">
                          {t('aiLab.composer.attachFile')}
                        </span>
                      </button>
                    </>
                  )}

                  <ModePicker mode={mode} onChange={onModeChange} disabled={disabled} />


                  <ModelStrengthPicker disabled={disabled} />
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  {/* 浏览器不支持 / 权限被拒 → 整颗不渲染。点了没反应的假按钮比没有更糟。 */}
                  {speech.supported && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={speech.toggle}
                      aria-pressed={speech.listening}
                      aria-label={t(
                        speech.listening ? 'aiLab.composer.voice.stop' : 'aiLab.composer.voice.start'
                      )}
                      title={t(
                        speech.listening ? 'aiLab.composer.voice.stop' : 'aiLab.composer.voice.start'
                      )}
                      className={cn(
                        'grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-40 cursor-pointer',
                        speech.listening
                          ? 'border-transparent bg-sky-500 text-[#fff]'
                          : 'border-white/[0.08] bg-white/[0.045] text-neutral-300 hover:bg-white/[0.075]'
                      )}
                    >
                      <Mic size={17} className={cn(speech.listening && 'animate-pulse')} />
                    </button>
                  )}

                  <AnimatePresence mode="popLayout" initial={false}>
                    {running ? (
                      <motion.button
                        key="stop"
                        type="button"
                        aria-label={t('aiLab.run.stop')}
                        title={t('aiLab.run.stop')}
                        onClick={onStop}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border border-transparent bg-sky-500 text-[#fff] transition-colors hover:bg-sky-400 cursor-pointer"
                      >
                        <Square size={12} fill="currentColor" />
                      </motion.button>
                    ) : (
                      <motion.button
                        key="send"
                        type="button"
                        aria-label={t('aiLab.composer.send')}
                        onClick={submit}
                        disabled={disabled || !canSend}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                          'grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border transition-colors duration-150',
                          // 点亮态靠**对比度**而不是**色相**说「可以发了」：一整颗饱和蓝在这个
                          // 极暗、近乎单色的输入框里会直接跳出来。neutral-100/900 这对在浅色
                          // 主题下会自动翻面（深墨底 + 近白箭头），不需要额外分支。
                          sendLit
                            ? 'border-transparent bg-neutral-100 text-neutral-900 hover:bg-neutral-50 cursor-pointer'
                            : 'border-white/[0.1] text-neutral-500 cursor-default'
                        )}
                      >
                        <ArrowUp size={17} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ProUpgradeBanner retired={conversationStarted} />
      </div>
    </div>
  );
}

export default React.memo(Composer);
