"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp, Check, Download } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from "@/lib/utils";
import { inspectResumeFontPack, downloadResumeFontPack } from '@/lib/utils/pdf-export';

import { EASE_ENTER } from '@magic-resume/utils';
/* ------------------------------------------------------------------ *
 * 右侧自定义面板的统一控件原语 —— 深色工作台 + sky 点缀、少 border。
 * 仅用 transform / opacity 动效,克制不抢戏(对齐 .impeccable.md)。
 * ------------------------------------------------------------------ */

/** 折叠分区:头部 [图标][标题][chevron],内容高度过渡展开 */
export function AccordionSection({
  sectionId,
  icon,
  title,
  open,
  onToggle,
  registerRef,
  children,
}: {
  sectionId: string;
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  registerRef?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={registerRef}
      data-section={sectionId}
      className="scroll-mt-4 border-b border-mr-line-soft last:border-b-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 px-1 py-3.5 text-left transition-colors duration-150"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
            open
              ? "bg-sky-400/10 text-sky-300"
              : "bg-mr-surface-subtle text-neutral-400 group-hover:text-neutral-200",
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "flex-1 text-mr-subtitle font-semibold tracking-tight transition-colors duration-150",
            open ? "text-white" : "text-neutral-300 group-hover:text-white",
          )}
        >
          {title}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-neutral-500 transition-transform duration-200 group-hover:text-neutral-300",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_ENTER }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-1 pb-5 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 一行标签 + 右侧只读数值 pill */
function LabelRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mr-caption font-medium text-neutral-300">{label}</span>
      {value !== undefined && (
        <span className="rounded-md bg-mr-surface-muted px-2 py-0.5 font-mono text-mr-label tabular-nums text-neutral-300">
          {value}
        </span>
      )}
    </div>
  );
}

/** 区块小标题(分组用) */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-mr-label font-semibold uppercase tracking-[0.12em] text-neutral-500">
      {children}
    </h4>
  );
}

/** 细滑块 + 标签 + 数值 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="space-y-2.5">
      <LabelRow label={label} value={display} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="range-sky"
        style={{
          background: `linear-gradient(to right, #38bdf8 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
        }}
      />
    </div>
  );
}

/** 开关行(标题 + 描述 + switch) */
export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-mr-caption font-medium text-neutral-300">{label}</p>
        {description && (
          <p className="mt-0.5 text-mr-label leading-snug text-neutral-500">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-sky-500" : "bg-white/10 hover:bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-[#fff] shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

/** 分段预设按钮组 */
export function SegmentedField<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2.5">
      {label && <LabelRow label={label} />}
      <div className="flex gap-1 rounded-xl bg-mr-surface-subtle p-1">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "relative flex-1 rounded-lg px-2 py-1.5 text-mr-ui font-medium transition-colors duration-150",
                active ? "text-white" : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${label ?? "x"}`}
                  className="absolute inset-0 rounded-lg bg-sky-500/90 shadow-sm shadow-sky-500/20"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 一档字体包在 UI 里的状态。**按档位存，不按字体名存**——面板里十几个字体只对应三个
 * 包（黑体 / 宋体 / 楷体），下好宋体之后 Georgia 必须立刻显示为可切。
 */
interface FontPackState {
  ready: boolean;
  bytes: number;
  ratio: number;
  failed: boolean;
}

const EMPTY_FONT_PACK: FontPackState = { ready: false, bytes: 0, ratio: 0, failed: false };

/**
 * 未下载时用的预览字体栈。
 *
 * 把排头的 family 换成它的「Preview」微型子集(只含「字 Aa」,几 KB),后面的系统兜底
 * 原样保留——预览子集万一没加载出来,还能退到系统字体,不至于空着。
 */
const previewStack = (stack: string) => {
  const parts = stack.split(',');
  const head = parts[0].trim().replace(/^["']|["']$/g, '');
  return [`"${head} Preview"`, parts.slice(1).join(',').trim()].filter(Boolean).join(', ');
};

const formatPackSize = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * 字体选择：自定义下拉（Radix portal，带逐项字体预览，深色工作台风格）。
 *
 * **切换是被下载闸住的**：CJK 字体一档 5–8MB，没在本地时点下去只会得到一段无解释的
 * 等待。这里把它摊开——没下载的那档显示体积和下载图标，点击先下载、进度就地显示，
 * 下完才真正切过去。已在本地的字体行为不变，不多一次点击。
 */
export function FontField({
  label,
  value,
  onChange,
  fonts,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fonts: { name: string; value: string; preview: string; webfont?: boolean }[];
}) {
  const { t } = useTranslation();
  const selected = fonts.find((f) => f.value === value) ?? fonts[0];

  const [open, setOpen] = useState(false);
  const [packIdOf, setPackIdOf] = useState<Record<string, string>>({});
  const [packs, setPacks] = useState<Record<string, FontPackState>>({});
  const [pending, setPending] = useState<string | null>(null);
  // 完成回调里要读「用户现在还想切到哪」，走 ref 而不是 state：那一步是副作用，
  // 放进 setState 的 updater 里会在 StrictMode 下被跑两次。
  const pendingRef = useRef<string | null>(null);
  // Radix 选中后会自己关闭。挑了一个没下载的字体时这次关闭要作废，否则进度条刚出现
  // 就随面板消失了。
  const keepOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    void (async () => {
      const results = await Promise.all(
        fonts.map(async (f) => [f.value, await inspectResumeFontPack(f.value)] as const),
      );
      if (!alive) return;

      const ids: Record<string, string> = {};
      const found: Record<string, FontPackState> = {};
      for (const [stack, pack] of results) {
        ids[stack] = pack.id;
        found[pack.id] ??= { ready: pack.ready, bytes: pack.bytes, ratio: 0, failed: false };
      }
      setPackIdOf(ids);
      setPacks((prev) => {
        const next = { ...prev };
        for (const [id, state] of Object.entries(found)) next[id] ??= state;
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [open, fonts]);

  const patchPack = (id: string, patch: Partial<FontPackState>) =>
    setPacks((prev) => ({
      ...prev,
      [id]: { ...EMPTY_FONT_PACK, ...prev[id], ...patch },
    }));

  const startDownload = (fontStack: string) => {
    const id = packIdOf[fontStack];
    if (!id || packs[id]?.ready) return;

    pendingRef.current = fontStack;
    setPending(fontStack);
    patchPack(id, { failed: false });

    void downloadResumeFontPack(fontStack, (ratio) => patchPack(id, { ratio }))
      .then(() => {
        patchPack(id, { ready: true, ratio: 1 });
        // 点它就是想换，下完直接切过去，不该再点一次。
        // 若这期间用户又点了别的字体，pending 已经变了，这次就只是「下好了」。
        if (pendingRef.current !== fontStack) return;
        pendingRef.current = null;
        setPending(null);
        onChange(fontStack);
        setOpen(false);
      })
      .catch(() => {
        patchPack(id, { failed: true, ratio: 0 });
        if (pendingRef.current !== fontStack) return;
        pendingRef.current = null;
        setPending(null);
      });
  };

  const handleValueChange = (next: string) => {
    const id = packIdOf[next];
    const pack = id ? packs[id] : undefined;
    if (pack && !pack.ready) {
      keepOpen.current = true;
      startDownload(next);
      return; // 不调 onChange —— 下载好了才切换
    }
    onChange(next);
  };

  const pendingPackId = pending ? packIdOf[pending] : undefined;
  const pendingRatio = pendingPackId ? (packs[pendingPackId]?.ratio ?? 0) : 0;

  return (
    <div className="space-y-2.5">
      <LabelRow label={label} />
      <SelectPrimitive.Root
        value={value}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={(next) => {
          if (!next && keepOpen.current) {
            keepOpen.current = false;
            return;
          }
          setOpen(next);
        }}
      >
        <SelectPrimitive.Trigger className="group relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-lg border border-white/10 bg-mr-surface-subtle px-3 text-left text-mr-caption text-neutral-100 outline-none transition-colors duration-150 hover:border-white/20 focus:border-sky-400/60 data-[state=open]:border-sky-400/60">
          <span className="text-lg leading-none text-neutral-200" style={{ fontFamily: selected.value }}>
            {selected.preview}
          </span>
          <span className="flex-1 truncate">{selected.name}</span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              size={15}
              className="shrink-0 text-neutral-500 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </SelectPrimitive.Icon>
          {/* 面板被关掉时下载仍在继续，这条线是它唯一的痕迹。 */}
          {pending && (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px origin-left bg-sky-400/80 transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${pendingRatio})` }}
            />
          )}
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-[60] max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl shadow-black/50 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-neutral-500">
              <ChevronUp size={14} />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1.5">
              {fonts.map((f) => {
                const packId = packIdOf[f.value];
                const pack = packId ? packs[packId] : undefined;
                // 同一档的多个字体共享一次下载，所以进度按 packId 比对，不按字体名。
                const busy = !!pack && !pack.ready && packId === pendingPackId;

                return (
                  <SelectPrimitive.Item
                    key={f.value}
                    value={f.value}
                    className="relative flex cursor-pointer select-none items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2 text-mr-caption text-neutral-300 outline-none transition-colors duration-100 data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white data-[state=checked]:text-sky-300"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-mr-surface-muted text-base text-neutral-200"
                      /*
                        没下载的字体**不能用它自己预览**——@font-face 会为了画这个字
                        把整包拉下来，而那正是下载按钮要拦的东西。未就绪时改用只含
                        「字 Aa」的微型子集（几 KB），看得见样子又不触发整包下载；
                        下完换回真身，顺带成了完成的反馈。
                        系统字体项（苹方/宋体…）没有 webfont，始终按原栈渲染。
                      */
                      style={{
                        fontFamily: f.webfont && !pack?.ready ? previewStack(f.value) : f.value,
                      }}
                    >
                      {f.preview}
                    </span>
                    <SelectPrimitive.ItemText>{f.name}</SelectPrimitive.ItemText>

                    {pack && !pack.ready && (
                      /*
                        真按钮，不是图标标签。
                        `tabIndex={-1}`:键盘不用走到它——在行上按回车同样会命中下载闸门,
                        多一个 tab stop 只会让键盘用户每个字体都多按一次。
                        三个 stopPropagation:Radix 的 Item 在 pointerup 上选中,不拦住的话
                        点按钮会连带触发一次选中。就算漏了也不出错——闸门会把它变成同一次下载。
                      */
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={busy ? t('templatePanel.font.downloading') : t('templatePanel.font.download')}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!busy) startDownload(f.value);
                        }}
                        className={cn(
                          'relative ml-auto flex h-6 shrink-0 items-center gap-1 overflow-hidden rounded-md px-1.5 text-mr-label transition-colors duration-150',
                          busy
                            ? 'cursor-default bg-sky-400/10 text-sky-300'
                            : pack.failed
                              ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                              : 'bg-mr-surface-soft text-neutral-300 hover:bg-sky-400/15 hover:text-sky-200',
                        )}
                      >
                        {/* 进度直接填在按钮里,不另起一条进度条——它本身就是这次下载的载体 */}
                        {busy && (
                          <span
                            aria-hidden
                            className="absolute inset-0 origin-left bg-sky-400/25 transition-transform duration-200 ease-out"
                            style={{ transform: `scaleX(${pack.ratio})` }}
                          />
                        )}
                        <span className="relative flex items-center gap-1">
                          {busy ? (
                            <span className="tabular-nums">{Math.round(pack.ratio * 100)}%</span>
                          ) : (
                            <>
                              <Download size={11} aria-hidden />
                              <span className="tabular-nums">
                                {pack.failed
                                  ? t('templatePanel.retry')
                                  : pack.bytes > 0
                                    ? formatPackSize(pack.bytes)
                                    : t('templatePanel.font.download')}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    )}

                    <SelectPrimitive.ItemIndicator className="ml-auto shrink-0">
                      <Check size={14} className="text-sky-300" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-neutral-500">
              <ChevronDown size={14} />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

export const PANEL_FONTS = [
  // 中文字体。**每一项都对应一个真实的 CJK 字体包**(见 resume-templates 的
  // font-family.ts),不是只换 CSS 栈——屏幕靠 globals.css 的 @font-face,
  // PDF 靠 pdf/browser.tsx 的 manifest,两侧指的是同一批 woff2。
  { name: "苹方 PingFang", value: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', preview: "字" },
  { name: "微软雅黑", value: '"Microsoft YaHei", "PingFang SC", sans-serif', preview: "字" },
  { name: "思源黑体", value: '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", sans-serif', preview: "字" },
  { name: "未来荧黑", value: '"Glow Sans SC", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "昭源黑体", value: '"Chiron Hei HK", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "霞鹜漫黑", value: '"LXGW Bright GB", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "更纱黑体", value: '"Sarasa Gothic SC", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "宋体 Songti", value: '"Songti SC", "SimSun", serif', preview: "字" },
  { name: "昭源宋体", value: '"Chiron Sung HK", "Songti SC", serif', preview: "字" , webfont: true },
  { name: "朱雀仿宋", value: '"Zhuque Fangsong", "FangSong", serif', preview: "字" , webfont: true },
  { name: "楷体 Kaiti", value: '"Kaiti SC", "KaiTi", serif', preview: "字" },
  { name: "霞鹜臻楷", value: '"LXGW ZhenKai GB", "Kaiti SC", serif', preview: "字" , webfont: true },
  { name: "秋水书体", value: '"Qiushui Shotai", "Kaiti SC", serif', preview: "字" , webfont: true },
  { name: "霞鹜标记体", value: '"LXGW Marker Gothic", "PingFang SC", sans-serif', preview: "字" , webfont: true },
  { name: "Maple Mono CN", value: '"Maple Mono CN", ui-monospace, monospace', preview: "Aa" , webfont: true },
  { name: "Inter", value: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", preview: "Aa" },
  { name: "Helvetica", value: '"Helvetica Neue", Helvetica, Arial, sans-serif', preview: "Aa" },
  { name: "Arial", value: 'Arial, "Helvetica Neue", sans-serif', preview: "Aa" },
  { name: "Georgia", value: 'Georgia, "Times New Roman", serif', preview: "Aa" },
  { name: "Times New Roman", value: '"Times New Roman", Georgia, serif', preview: "Aa" },
  { name: "System UI", value: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", preview: "Aa" },
  { name: "Roboto", value: 'Roboto, "Helvetica Neue", Arial, sans-serif', preview: "Aa" },
  { name: "IBM Plex Serif", value: '"IBM Plex Serif", Georgia, serif', preview: "Aa" },
];
