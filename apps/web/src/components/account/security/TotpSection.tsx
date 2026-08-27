'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, ShieldCheck } from '@magic-resume/icons';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { clerkErrorMessage } from './clerkError';

import type { useUser } from '@clerk/nextjs';

/**
 * 从 `useUser()` 的返回类型反推，而不是导 `@clerk/types`——后者已并入 `@clerk/shared`
 * 且不是本包的直接依赖，导它是幻影依赖；这样写 Clerk 再搬一次类型也不会断。
 */
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;


type Step = 'idle' | 'scan' | 'codes' | 'confirmDisable';

/**
 * 两步验证（TOTP）+ 备用码。
 *
 * **只能在客户端做。** Clerk 的 Backend SDK 上只有 `deleteUserTOTP` / `disableUserMFA`
 * ——能关不能开。绑定 TOTP 天然要把密钥展示给当前登录的这个人、并让他用验证器回证，
 * 后端拿不到"这个人此刻在屏幕前"这个前提。
 *
 * 流程里唯一不可逆的伤害在最后一步：**验证通过后如果没拿到备用码就关掉，用户换手机时
 * 就再也进不来了**。所以「已保存」不是一句提示，而是一道闸——没勾选就收不起这一节，
 * 也不给关闭入口。宁可让人多点一下，也不能让人把自己锁在门外。
 */
export default function TotpSection({ user }: { user: ClerkUser }) {
  const { t } = useTranslation();
  const on = !!user.totpEnabled;

  const [step, setStep] = useState<Step>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 二维码用已装的 `qrcode`（邀请海报刚引入），不为这一处再拉一个依赖。
  useEffect(() => {
    if (step !== 'scan' || !uri || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, uri, {
      width: 168,
      margin: 1,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
  }, [step, uri]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const totp = await user.createTOTP();
      setUri(totp.uri ?? null);
      setSecret(totp.secret ?? null);
      setStep('scan');
    } catch (err) {
      setError(clerkErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await user.verifyTOTP({ code });
      // 验证通过的下一件事必须是拿到备用码——中间不能有任何可退出的空档。
      const backup = await user.createBackupCode();
      setCodes(backup.codes ?? []);
      setStep('codes');
      setCode('');
    } catch (err) {
      setError(clerkErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await user.disableTOTP();
      setStep('idle');
    } catch (err) {
      setError(clerkErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadCodes = () => {
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'magic-resume-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => {
    setStep('idle');
    setCodes([]);
    setSaved(false);
  };

  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-100">
          <ShieldCheck size={16} className="shrink-0 text-neutral-500" />
          <span className="truncate">{t('account.security.totp.label')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px]',
              on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-neutral-500'
            )}
          >
            {t(on ? 'account.security.on' : 'account.security.off')}
          </span>
          {/* 展示备用码时不给任何退出口——这一步没有"取消"。 */}
          {step !== 'codes' && (
            <button
              type="button"
              onClick={() => {
                if (step !== 'idle') return setStep('idle');
                return on ? setStep('confirmDisable') : begin();
              }}
              disabled={busy}
              className={cn(
                'rounded px-2 py-1 text-[12px] transition-colors disabled:opacity-40 cursor-pointer',
                on
                  ? 'text-rose-300 hover:bg-rose-400/10'
                  : 'text-sky-300 hover:bg-sky-400/10 hover:text-sky-200'
              )}
            >
              {step !== 'idle'
                ? t('account.security.cancel')
                : t(on ? 'account.security.totp.disable' : 'account.security.totp.enable')}
            </button>
          )}
        </div>
      </div>

      {step === 'scan' && (
        <form onSubmit={verify} className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
          <p className="text-[12px] leading-relaxed text-neutral-400">
            {t('account.security.totp.scanHint')}
          </p>
          <div className="flex items-start gap-3">
            <canvas ref={canvasRef} className="shrink-0 rounded-lg bg-white p-1.5" />
            <div className="min-w-0 flex-1 space-y-2">
              {/* 相机不可用、或用桌面验证器的人需要手输，密钥必须给得出来。 */}
              <div>
                <span className="mb-1 block text-[11px] text-neutral-500">
                  {t('account.security.totp.manualKey')}
                </span>
                <code className="block select-all break-all rounded bg-neutral-950/60 px-2 py-1 font-mono text-[11.5px] text-neutral-300">
                  {secret}
                </code>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] text-neutral-500">
                  {t('account.security.totp.enterCode')}
                </span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full rounded-lg border border-white/[0.08] bg-neutral-950/60 px-3 py-1.5 font-mono text-[14px] tracking-[0.3em] text-neutral-100 outline-none transition-colors focus:border-sky-400/40"
                />
              </label>
            </div>
          </div>
          {error && <p className="text-[12px] text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-40 cursor-pointer"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t('account.security.totp.verify')}
          </button>
        </form>
      )}

      {step === 'codes' && (
        <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
          <p className="text-[12px] font-medium leading-relaxed text-amber-200/90">
            {t('account.security.totp.codesWarning')}
          </p>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-neutral-950/60 p-2.5 font-mono text-[12px] text-neutral-200">
            {codes.map((c) => (
              <span key={c} className="select-all">
                {c}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyCodes}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors cursor-pointer',
                copied
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-white/[0.06] text-neutral-200 hover:bg-white/[0.1]'
              )}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {t(copied ? 'account.security.totp.copied' : 'account.security.totp.copyAll')}
            </button>
            <button
              type="button"
              onClick={downloadCodes}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[12.5px] text-neutral-200 transition-colors hover:bg-white/[0.1] cursor-pointer"
            >
              <Download size={13} />
              {t('account.security.totp.download')}
            </button>
          </div>
          {/* 这道闸是硬的：没勾就没有出口。 */}
          <label className="flex items-start gap-2 text-[12px] text-neutral-300">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-sky-500"
            />
            {t('account.security.totp.confirmSaved')}
          </label>
          <button
            type="button"
            onClick={finish}
            disabled={!saved}
            className="inline-flex items-center rounded-lg bg-sky-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-40 cursor-pointer"
          >
            {t('account.security.done')}
          </button>
        </div>
      )}

      {step === 'confirmDisable' && (
        <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[12px] leading-relaxed text-neutral-400">
            {t('account.security.totp.disableWarning')}
          </p>
          {error && <p className="text-[12px] text-rose-300">{error}</p>}
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/90 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#fff] transition-colors hover:bg-rose-500 disabled:opacity-40 cursor-pointer"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t('account.security.totp.confirmDisable')}
          </button>
        </div>
      )}
    </div>
  );
}
