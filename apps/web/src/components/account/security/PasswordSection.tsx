'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { clerkErrorMessage } from './clerkError';

import type { useUser } from '@clerk/nextjs';

/**
 * 从 `useUser()` 的返回类型反推，而不是导 `@clerk/types`——后者已并入 `@clerk/shared`
 * 且不是本包的直接依赖，导它是幻影依赖；这样写 Clerk 再搬一次类型也不会断。
 */
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;


/**
 * 密码：设置或修改。
 *
 * 直接调客户端 SDK 的 `user.updatePassword()`，不经我们自己的后端——不是图省事：
 * Clerk 的 Backend API 用 `updateUser({ password })` 改密码时**不校验旧密码**，
 * 那等于谁拿到一个被劫持的会话，谁就能静默改掉密码把机主锁在门外。客户端这条则强制
 * 校验旧密码，还顺带给了 `signOutOfOtherSessions`。
 *
 * `currentPassword` 是可选参数，所以一套表单覆盖两种情形：OAuth 注册的用户从未设过
 * 密码（`passwordEnabled === false`），此时不该问他"当前密码"。
 */
export default function PasswordSection({ user }: { user: ClerkUser }) {
  const { t } = useTranslation();
  const has = !!user.passwordEnabled;

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setError(t('account.security.password.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await user.updatePassword({
        newPassword: next,
        ...(has ? { currentPassword: current } : {}),
        // 不给开关，默认踢掉其它会话：改密码这个动作的意义本来就是"把别人赶出去"。
        // 留一个默认关闭的复选框，等于把一个安全决策推给不该承担它的人。
        signOutOfOtherSessions: true,
      });
      reset();
    } catch (err) {
      setError(clerkErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-100">
          <KeyRound size={16} className="shrink-0 text-neutral-500" />
          <span className="truncate">{t('account.security.password.label')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px]',
              has ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-neutral-500'
            )}
          >
            {t(has ? 'account.security.on' : 'account.security.off')}
          </span>
          <button
            type="button"
            onClick={() => (open ? reset() : setOpen(true))}
            className="rounded px-2 py-1 text-[12px] text-sky-300 transition-colors hover:bg-sky-400/10 hover:text-sky-200 cursor-pointer"
          >
            {t(open ? 'account.security.cancel' : has ? 'account.security.password.change' : 'account.security.password.set')}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
          {has && (
            <Field
              label={t('account.security.password.current')}
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
          )}
          <Field
            label={t('account.security.password.new')}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <Field
            label={t('account.security.password.confirm')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />

          {error && <p className="text-[12px] text-rose-300">{error}</p>}

          {/* 先说清后果再让人点。「其它设备会被登出」不是副作用，是这个动作的一半意义。 */}
          <p className="text-[11.5px] leading-relaxed text-neutral-500">
            {t('account.security.password.signOutNotice')}
          </p>

          <button
            type="submit"
            disabled={busy || !next || !confirm || (has && !current)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-40 cursor-pointer"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t('account.security.save')}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-neutral-500">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-neutral-950/60 px-3 py-1.5 text-[13px] text-neutral-100 outline-none transition-colors focus:border-sky-400/40"
      />
    </label>
  );
}
