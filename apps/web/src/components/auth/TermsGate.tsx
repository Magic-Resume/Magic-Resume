'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { Trans, useTranslation } from 'react-i18next';
import { Check } from '@magic-resume/icons';
import { LegalDocDialog, type LegalDocId } from './LegalDocDialog';

/**
 * 服务条款门禁。
 *
 * 三条判断写在这里，因为它们容易被改回去：
 *
 * 1. **未勾选时按钮仍可点**。灰掉一颗按钮不解释任何原因，用户只会觉得坏了；点了弹一句
 *    话说清为什么，才是一个能读懂的界面。
 * 2. 确认框里的「同意并继续」**勾上复选框并直接执行原本那个动作**。让他再点一次是惩罚。
 * 3. 勾选意向落 `sessionStorage` 而不是内存或 `localStorage`——OAuth 会整页跳出去再
 *    跳回来，内存里的状态活不过那一跳；而同意意向也不该跨会话留存。
 *    （落库要等登录后才有用户行，那一步归 `POST /api/users/me/terms`，见
 *    `docs/specs/onboarding-and-auth/brief.md` §10。）
 */

const PENDING_KEY = 'magic.terms.pending';

/** 条款版本。改版后与用户记录的版本不符即需重新征求同意，前后端共用这一个常量。 */
export const TERMS_VERSION = '2026-08-26';

function readPending(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) === TERMS_VERSION;
  } catch {
    return false;
  }
}

/**
 * 登录页勾下的同意意向，登录后由 `TermsGuard` 取走补写进库。
 *
 * 取走即清：补写是幂等的（服务端按 userId 更新），留着只会让每次加载都重发一次。
 */
export function takePendingConsent(): string | null {
  if (!readPending()) return null;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
  return TERMS_VERSION;
}

/**
 * 「我已阅读并同意 <条款> 与 <隐私>」。
 *
 * 两个占位符是**按钮**不是链接：正文在弹窗里就地打开（`LegalDocDialog`），不再把人
 * 连同半填的表单一起丢去新标签页。
 */
function TermsLinks({ onOpen }: { onOpen: (doc: LegalDocId) => void }) {
  const linkClass =
    'text-[color:var(--text-secondary)] underline underline-offset-2 transition-colors hover:text-[color:var(--text-primary)]';
  return (
    <Trans
      i18nKey="auth.terms.agree"
      components={{
        terms: <button type="button" onClick={() => onOpen('terms')} className={linkClass} />,
        privacy: <button type="button" onClick={() => onOpen('privacy')} className={linkClass} />,
      }}
    />
  );
}

export function useTermsGate() {
  const { t } = useTranslation();
  const checkboxId = useId();
  const [accepted, setAccepted] = useState(false);
  // 被门禁拦下的那个动作。同意之后要**接着执行它**，不是让用户重来。
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  // 正在阅读的那份文档（`null` = 没在读）。可以在确认框之上再叠一层：想读条款的那一刻
  // 往往正是被确认框拦住的那一刻，把确认框收掉再让他重来一次是没道理的。
  const [doc, setDoc] = useState<LegalDocId | null>(null);

  useEffect(() => {
    // 挂载后才读：`sessionStorage` 在服务端不存在，直接读会弄坏水合。
    if (readPending()) setAccepted(true);
  }, []);

  const persist = useCallback((next: boolean) => {
    setAccepted(next);
    try {
      if (next) window.sessionStorage.setItem(PENDING_KEY, TERMS_VERSION);
      else window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // 隐私模式下写不进去。门禁本身仍然生效，只是跳一次 OAuth 回来要重勾。
    }
  }, []);

  /** 包住一个需要先同意条款的动作。 */
  const guard = useCallback(
    (action: () => void) => () => {
      if (accepted) {
        action();
        return;
      }
      // 存的是函数，`setState` 会把裸函数当 updater 调用，所以要再包一层。
      setPendingAction(() => action);
    },
    [accepted],
  );

  const dialog = (
    <>
      <Dialog.Root open={!!pendingAction} onOpenChange={(next) => !next && setPendingAction(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[2px]" />
          <Dialog.Content asChild>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.25, 1] }}
              className="fixed left-1/2 top-1/2 z-[201] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-hairline bg-raised p-5 shadow-overlay outline-none"
            >
              <Dialog.Title className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {t('auth.terms.confirmTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-2.5 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
                <TermsLinks onOpen={setDoc} />
              </Dialog.Description>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="rounded-[9px] px-3.5 py-2 text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-sunk"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = pendingAction;
                    persist(true);
                    setPendingAction(null);
                    // 同意即继续——他刚才点的那个按钮不该白点。
                    action?.();
                  }}
                  // 原来是纯白底黑字。深色下没问题，浅色下那是白纸上贴白纸——按钮整个消失。
                  // 换成产品既有的主 CTA（sky 填充），两种主题下都是同一颗按钮。
                  className="rounded-[9px] bg-fill-sky px-3.5 py-2 text-[13px] font-medium text-white transition-[filter] hover:brightness-110"
                >
                  {t('auth.terms.agreeAndContinue')}
                </button>
              </div>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 叠在确认框之上（z 210/211）。Radix 的层栈保证只有最上面那层响应 Esc 与
          点击外部，所以读完关掉文档，确认框还在原处等着。 */}
      <LegalDocDialog doc={doc} onOpenChange={(next) => !next && setDoc(null)} />
    </>
  );

  // 文字**不再**包在 `<label>` 里：两个占位符现在是按钮，而 `<label>` 内放可交互元素
  // 既不合法、行为也错——点「服务条款」会顺带把同意框勾上，等于替他做了决定。
  // 于是 label 只包那个方框（`aria-label` 给它一个可读的名字），文字独立成一段。
  const checkbox = (
    <div className="flex select-none items-start gap-2 text-[12.5px] leading-relaxed text-[color:var(--text-muted)]">
      <input
        id={checkboxId}
        type="checkbox"
        checked={accepted}
        onChange={(event) => persist(event.target.checked)}
        className="peer sr-only"
      />
      <label
        htmlFor={checkboxId}
        aria-label={t('auth.terms.checkboxLabel')}
        // `after` 把命中区从 16px 撑到 28px：方框本身是可点的最小尺寸，光标却不该
        // 需要那么准。
        className={`relative mt-px grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--accent)] ${
          accepted
            ? 'bg-[color:var(--accent)] text-white'
            : 'ring-1 ring-inset ring-[color:var(--border-strong)]'
        }`}
      >
        {accepted && <Check size={11} strokeWidth={3} />}
      </label>
      <span>
        <TermsLinks onOpen={setDoc} />
      </span>
    </div>
  );

  return { accepted, guard, dialog, checkbox };
}

/**
 * 条款改版 / 存量用户的重新征求。
 *
 * 写在这个文件里而不是另起一个组件：它和登录页那个确认框必须长得一模一样，分家之后
 * 两边的圆角和按钮迟早会漂。区别只有两点——
 *
 * 1. **只有「同意」一个出口，没有「取消」。** 不同意就用不了，这是事实；给一个假的
 *    「取消」等于让人以为还有别的选择。真正的另一条路是「退出登录」，所以给那个。
 * 2. 文案分两种：从没同意过（存量用户）vs 条款有更新。后者要说清是条款变了，
 *    而不是让他以为自己从没同意过。
 */
export function TermsReconsentDialog({
  open,
  reconsent,
  onAccept,
  onSignOut,
}: {
  open: boolean;
  reconsent: boolean;
  onAccept: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<LegalDocId | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Dialog.Root open={open}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[2px]" />
          <Dialog.Content
            asChild
            // 没有出口的对话框不该能被 Esc 或点击外部关掉——那只会造出一个「关掉了但
            // 什么都没变」的状态，下次加载又弹回来。
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.25, 1] }}
              className="fixed left-1/2 top-1/2 z-[201] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-hairline bg-raised p-5 shadow-overlay outline-none"
            >
              <Dialog.Title className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {t(
                  reconsent
                    ? 'auth.terms.updatedTitle'
                    : 'auth.terms.confirmTitle',
                )}
              </Dialog.Title>
              <Dialog.Description className="mt-2.5 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
                {reconsent ? (
                  <>
                    {t('auth.terms.updatedHint')}{' '}
                    <TermsLinks onOpen={setDoc} />
                  </>
                ) : (
                  <TermsLinks onOpen={setDoc} />
                )}
              </Dialog.Description>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-[9px] px-3.5 py-2 text-[13px] text-[color:var(--text-secondary)] transition-colors hover:bg-sunk"
                >
                  {t('account.menu.signOut')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    onAccept();
                  }}
                  className="rounded-[9px] bg-fill-sky px-3.5 py-2 text-[13px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
                >
                  {t('auth.terms.agreeAndContinue')}
                </button>
              </div>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <LegalDocDialog doc={doc} onOpenChange={(next) => !next && setDoc(null)} />
    </>
  );
}
