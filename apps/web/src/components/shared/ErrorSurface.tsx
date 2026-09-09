'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, RotateCcw } from '@magic-resume/icons';
import {
  Button as DesignButton,
  buttonVariants,
} from '@magic-resume/design-system';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/extensions/legal';

/**
 * 四个失败界面（段级 / 根级 / 404 / 根布局兜底）共用的这一屏。
 *
 * 顺序是刻意的：**先承诺，再解释，最后才是动作**。用户看到白屏时问的是「我的简历还在
 * 吗」，不是「发生了什么错误」——所以承诺行比说明行更亮、更靠前。红色一律不用：数据没
 * 危险、用户没做错事，红圈制造的焦虑与承诺行直接打架，红留给简历修订里的真删除。
 *
 * `global-error.tsx` 不能用这个组件——那一档连主题和 i18n 都可能已经挂了，只对齐语气。
 */

const PET_SIT = '/marks/polaris-pet-sit.svg';
const PET_OFFLINE = '/marks/polaris-pet-offline.svg';
const PET_THINKING = '/marks/polaris-pet-thinking.svg';

const COUNTDOWN_SECONDS = 3;
/** 自动重试真成了的话这个组件早卸载了；还在，就是没成。 */
const RETRY_VERDICT_MS = 1500;

/**
 * 同一个错误只自动重试一次。
 *
 * 渲染崩溃 + 无条件 `reset()` 是一个死循环：崩 → 边界挂载 → 自动重试 → 再崩。模块级
 * Set 挡住本次会话内的重挂载，sessionStorage 挡住整页刷新后的再次尝试。
 */
const triedFingerprints = new Set<string>();
const STORAGE_PREFIX = 'mr:error-auto-retry:';

function hasTried(fingerprint: string): boolean {
  if (triedFingerprints.has(fingerprint)) return true;
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + fingerprint) !== null;
  } catch {
    return false;
  }
}

function markTried(fingerprint: string): void {
  // 先写内存那份：无痕模式下 sessionStorage 会抛，而防重入正是这里最不能丢的东西。
  triedFingerprints.add(fingerprint);
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + fingerprint, '1');
  } catch {
    /* 存不下就只靠内存那份，最坏是刷新后多试一次 */
  }
}

type Phase = 'countdown' | 'manual' | 'retrying' | 'exhausted';

export type ErrorSurfaceProps = {
  /** `fault` = 我们坏了（小宠断线）；`missing` = 东西不在（系统没坏，天线照亮）。 */
  variant?: 'fault' | 'missing';
  /** `section` 保留侧栏与路由——崩的只是一段，不该演成整个 app 挂了。 */
  fill?: 'screen' | 'section';
  eyebrow?: string;
  title: string;
  /** 第一句回答「我的东西还在吗」，不是「发生了什么」。 */
  promise?: string;
  note?: string;
  /** 传了才启用重试；配合 `fingerprint` 才会自动重试。 */
  onRetry?: () => void;
  fingerprint?: string;
  /** 没有重试可做时（404）的主动作。有 `onRetry` 时由恢复状态机接管，这里被忽略。 */
  primary?: { label: string; href: string };
  secondary?: { label: string; href?: string; onClick?: () => void };
  /** 展示并可复制的错误码——用户找客服时唯一能说清「是哪一次」的东西。 */
  code?: string;
  detail?: React.ReactNode;
};

export default function ErrorSurface({
  variant = 'fault',
  fill = 'screen',
  eyebrow,
  title,
  promise,
  note,
  onRetry,
  fingerprint,
  primary,
  secondary,
  code,
  detail,
}: ErrorSurfaceProps) {
  const { t } = useTranslation();

  // 没有指纹就不自动重试：没有去重键的自动重试就是没有刹车的自动重试。
  const [phase, setPhase] = useState<Phase>(
    onRetry && fingerprint ? 'countdown' : 'manual',
  );
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [copied, setCopied] = useState(false);

  const runRetry = useCallback(() => {
    if (!onRetry) return;
    if (fingerprint) markTried(fingerprint);
    setPhase('retrying');
    onRetry();
  }, [onRetry, fingerprint]);

  // 「这个错误已经自动试过一次」只能挂载后再判：在 useState 初始化里读 sessionStorage，
  // 服务端渲染出倒计时、客户端渲染出已试过，React 会直接判 hydration 失配。
  useEffect(() => {
    if (!onRetry || !fingerprint) return;
    if (hasTried(fingerprint)) setPhase('exhausted');
    // 只在挂载时判一次；此后由状态机自己推进。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (seconds <= 0) {
      runRetry();
      return;
    }
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, seconds, runRetry]);

  // 一次失败的 reset() 不保证让边界重新挂载（Next 可能只换 error prop），所以「重试中」
  // 必须自带出口，否则页面会永远停在一个转圈的按钮上。
  useEffect(() => {
    if (phase !== 'retrying') return;
    const id = window.setTimeout(() => setPhase('exhausted'), RETRY_VERDICT_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* 剪贴板被拒就保持原样——这一屏不该再弹一个失败提示 */
    }
  }, [code]);

  const retrying = phase === 'retrying';
  const exhausted = phase === 'exhausted';
  const offline = variant === 'fault';
  // 像素画只能整数倍放大：24→72（3x）/ 24→48（2x）。56 是 2.33x，边缘会糊成一团。
  const petSize = fill === 'screen' ? 72 : 48;
  const petSrc = retrying ? PET_THINKING : offline ? PET_OFFLINE : PET_SIT;
  // 天线在用户眼前熄灭，比一开始就是暗的更说明「刚刚断的」。
  const showLitOverlay = offline && !retrying;

  const noteLine = exhausted ? t('errorPage.recovery.exhausted') : note;

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center px-6',
        fill === 'screen' ? 'bg-desk min-h-screen py-20' : 'min-h-[60vh] py-16',
      )}
    >
      {/* 整块居中于视口，块内一律左对齐——居中的长句读起来比左对齐费劲得多。 */}
      <div className="w-full max-w-[44ch]">
        <div
          className="rise relative"
          style={{ width: petSize, height: petSize }}
        >
          {retrying && (
            <span
              className="pet-glow bg-glow-sky/10 dark:bg-glow-sky/25 absolute inset-0 rounded-full blur-xl"
              aria-hidden="true"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={petSrc}
            width={petSize}
            height={petSize}
            alt=""
            aria-hidden="true"
            className="relative"
            style={{ imageRendering: 'pixelated' }}
          />
          {showLitOverlay && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={PET_SIT}
              width={petSize}
              height={petSize}
              alt=""
              aria-hidden="true"
              className="pet-lit absolute inset-0"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
        </div>

        {eyebrow && (
          <p
            className="rise text-muted mt-6 font-mono text-xs tracking-[0.2em]"
            style={{ animationDelay: '40ms' }}
          >
            {eyebrow}
          </p>
        )}

        <h1
          className={cn(
            'rise text-primary font-semibold tracking-tight',
            eyebrow ? 'mt-2' : 'mt-6',
            fill === 'screen'
              ? 'text-[2rem] leading-[1.15]'
              : 'text-2xl leading-[1.25]',
          )}
          style={{ animationDelay: '60ms' }}
        >
          {title}
        </h1>

        {promise && (
          <p
            className="rise text-primary mt-3 text-base leading-relaxed"
            style={{ animationDelay: '100ms' }}
          >
            {promise}
          </p>
        )}

        {noteLine && (
          <p
            className="rise text-secondary mt-3 text-sm leading-relaxed"
            style={{ animationDelay: '140ms' }}
          >
            {noteLine}
          </p>
        )}

        <div
          className="rise mt-7 flex flex-wrap items-center gap-x-5 gap-y-3"
          style={{ animationDelay: '180ms' }}
        >
          {onRetry && (
            <DesignButton
              variant="primary"
              size="lg"
              onClick={exhausted ? () => window.location.reload() : runRetry}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {retrying
                ? t('errorPage.recovery.retrying')
                : exhausted
                  ? t('errorPage.recovery.reload')
                  : phase === 'countdown'
                    ? t('errorPage.recovery.retryNow')
                    : t('errorPage.recovery.retry')}
            </DesignButton>
          )}

          {!onRetry && primary && (
            <Link
              href={primary.href}
              className={buttonVariants({ variant: 'primary', size: 'lg' })}
            >
              {primary.label}
            </Link>
          )}

          {/* 次动作降级为文字链：两个等权按钮只会让人不知道该点哪个。 */}
          {secondary &&
            (secondary.href ? (
              <Link
                href={secondary.href}
                className="text-secondary hover:text-primary text-sm underline-offset-4 transition-colors hover:underline"
              >
                {secondary.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondary.onClick}
                className="text-secondary hover:text-primary text-sm underline-offset-4 transition-colors hover:underline"
              >
                {secondary.label}
              </button>
            ))}
        </div>

        {phase === 'countdown' && (
          <p
            className="rise text-muted mt-3 flex items-center gap-3 text-xs"
            style={{ animationDelay: '200ms' }}
          >
            <span>{t('errorPage.recovery.countdown', { seconds })}</span>
            <button
              type="button"
              onClick={() => setPhase('manual')}
              className="text-ink-sky underline-offset-4 hover:underline"
            >
              {t('errorPage.recovery.cancel')}
            </button>
          </p>
        )}

        {(code || detail) && (
          <div
            className="rise border-hairline mt-9 border-t pt-4"
            style={{ animationDelay: '220ms' }}
          >
            {code && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={copyCode}
                  title={t('errorPage.code.copy')}
                  className="text-muted hover:text-secondary group inline-flex items-center gap-2 font-mono text-mr-label transition-colors"
                >
                  <span>{code}</span>
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                  {copied && (
                    <span className="font-sans">
                      {t('errorPage.code.copied')}
                    </span>
                  )}
                </button>
                {SUPPORT_EMAIL && (
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${code}] ${title}`)}`}
                    className="text-muted hover:text-secondary text-mr-label underline-offset-4 transition-colors hover:underline"
                  >
                    {t('errorPage.support')}
                  </a>
                )}
              </div>
            )}
            {detail && (
              <details className="rounded-card bg-sunk mt-4 p-3">
                <summary className="text-muted cursor-pointer text-xs">
                  {t('errorPage.detail')}
                </summary>
                <div className="text-secondary mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-mr-label leading-relaxed">
                  {detail}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .rise {
          animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        /* 入场落定后才熄灭，读作「在你面前断的」。 */
        .pet-lit {
          animation: petOut 420ms ease-out 560ms both;
        }
        @keyframes petOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        .pet-glow {
          animation: petGlow 4.8s ease-in-out infinite;
        }
        @keyframes petGlow {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.85;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rise,
          .pet-glow {
            animation: none;
          }
          .pet-lit {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
