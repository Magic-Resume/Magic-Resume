'use client';

import React, { useState } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Plus } from '@magic-resume/icons';

/**
 * 向导里的选择控件。
 *
 * 用 Radix 的 headless primitive 而不是一排 `<button>`：**roving focus 和方向键**手写
 * 几乎永远做不对——一组 chips 应该只占一个 Tab 停点、左右键在组内移动，而不是让用户
 * 按十几次 Tab 才走过一步。样式全部自己写，走本仓令牌。
 *
 * 不复用 `packages/genui` 的 Chips：那套是对话卡片的语言（窄、紧凑、跟着消息流），
 * 向导是全屏一次性仪式，节奏不同，硬套两边都变形。
 */

/** 入场按 index 错峰。40ms 够看出方向感，又不至于让最后一个等太久。 */
const STAGGER_MS = 40;

/**
 * 静息态就有 hairline 描边——上一版静息是纯文字，一排选项读起来像段落而不是可点的东西，
 * 用户得先猜哪些字能点。可点的必须看起来可点。
 */
const chipBase =
  'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ' +
  'ring-1 ring-inset ring-line transition-[color,box-shadow] duration-200 outline-none ' +
  'hover:ring-line-strong ' +
  'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** 选中态的底是一块**共用的**发光片，用 layoutId 在选项间滑过去，不是每颗各自亮灭。 */
function Selected({ layoutId }: { layoutId?: string }) {
  return (
    <motion.span
      {...(layoutId ? { layoutId } : {})}
      // 走 `--hover-2` / `--line-strong` 这两个主题感知令牌，不写死白色叠加：
      // 浅色主题下白叠白等于没有选中态。原来那道 inset 白高光一并去掉——它是纯深色
      // 语汇，浅色下要么看不见，要么反过来读成一道内阴影。
      className="absolute inset-0 rounded-full bg-hover-2 ring-1 ring-inset ring-line-strong"
      transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }}
    />
  );
}

function Chip({
  label,
  selected,
  index,
  layoutId,
}: {
  label: string;
  selected: boolean;
  index: number;
  layoutId?: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: (index * STAGGER_MS) / 1000, ease: [0.22, 0.61, 0.25, 1] }}
      className="contents"
    >
      {selected && <Selected layoutId={layoutId} />}
      <span
        className={`relative z-10 transition-colors duration-200 ${
          selected ? 'text-ink' : 'text-ink-2'
        }`}
      >
        {label}
      </span>
    </motion.span>
  );
}

export interface ChipGroupProps {
  kind: 'single' | 'multi';
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  ariaLabel: string;
  /** 单选组的滑动高亮要有唯一 layoutId，否则两组之间会互相飞。 */
  layoutId?: string;
}

export default function ChipGroup({
  kind,
  options,
  value,
  onChange,
  allowCustom,
  ariaLabel,
  layoutId,
}: ChipGroupProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  // 用户自己加的值也要显示成 chip：加完就看不见等于没加。
  const known = new Set(options.map((option) => option.value));
  const custom = value.filter((entry) => !known.has(entry));
  const all = [...options, ...custom.map((entry) => ({ value: entry, label: entry }))];

  const commitDraft = () => {
    const next = draft.trim();
    setDraft('');
    setAdding(false);
    if (!next || value.includes(next)) return;
    onChange(kind === 'single' ? [next] : [...value, next]);
  };

  const addButton = allowCustom && (
    <span className="inline-flex items-center">
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft();
            // Esc 是**放弃**，不是提交——写了一半反悔时不该被留下半个词。
            if (event.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder={t('onboarding.customPlaceholder')}
          aria-label={t('onboarding.customPlaceholder')}
          className="h-9 w-36 rounded-full bg-field px-3.5 text-[13px] text-ink outline-none ring-1 ring-inset ring-line-strong placeholder:text-ink-3 focus:ring-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${chipBase} text-ink-3 hover:text-ink-2`}
        >
          <Plus size={13} />
          {t('onboarding.addCustom')}
        </button>
      )}
    </span>
  );

  if (kind === 'single') {
    return (
      <RadioGroup.Root
        aria-label={ariaLabel}
        value={value[0] ?? ''}
        onValueChange={(next) => onChange(next ? [next] : [])}
        className="flex flex-wrap gap-2"
        loop
      >
        {all.map((option, index) => (
          <RadioGroup.Item key={option.value} value={option.value} className={chipBase}>
            <Chip
              label={option.label}
              selected={value[0] === option.value}
              index={index}
              layoutId={layoutId}
            />
          </RadioGroup.Item>
        ))}
        {addButton}
      </RadioGroup.Root>
    );
  }

  return (
    <ToggleGroup.Root
      type="multiple"
      aria-label={ariaLabel}
      value={value}
      onValueChange={onChange}
      className="flex flex-wrap gap-2"
      loop
    >
      {all.map((option, index) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={chipBase}>
          {/* 多选不共用高亮：多块底同时亮着，滑动动画会变成一团互相追赶的东西。 */}
          <Chip label={option.label} selected={value.includes(option.value)} index={index} />
        </ToggleGroup.Item>
      ))}
      {addButton}
    </ToggleGroup.Root>
  );
}
