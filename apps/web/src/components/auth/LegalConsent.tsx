"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { LegalDocDialog, type LegalDocId } from "./LegalDocDialog";

/**
 * The consent line, shown at the moment an account is actually created.
 *
 * Placement is the whole point. "注册即视为同意本协议" only holds if the
 * documents were in front of the person when they signed up — a link somewhere
 * else in the product does not make that claim true afterwards. So this renders
 * on both account-creating steps of the sign-up flow: the social buttons
 * (`start`, where an OAuth redirect creates the account) and the email form
 * (`email`). It deliberately does NOT render on `verify`, where the account
 * already exists and the consent has already been given.
 *
 * 正文**就地**打开（`LegalDocDialog`），不再 `target="_blank"`。原来那条注释说得没错
 * ——半填的注册表单必须活过「去读一遍我要同意的东西」——但新标签页只是绕开了问题：
 * 弹窗让表单压根不用离开视野，读完关掉就接着填。
 */
export function LegalConsent() {
  const { t } = useTranslation();
  const [doc, setDoc] = React.useState<LegalDocId | null>(null);

  const linkClass =
    "text-ink-sky underline underline-offset-2 transition-colors hover:text-ink-sky-hover";

  return (
    <>
      <p className="mt-1 text-center text-[12px] leading-relaxed text-[color:var(--text-muted)]">
        {t("auth.legalConsent")}{" "}
        <button type="button" onClick={() => setDoc("terms")} className={linkClass}>
          {t("auth.legalTerms")}
        </button>{" "}
        {t("auth.legalAnd")}{" "}
        <button type="button" onClick={() => setDoc("privacy")} className={linkClass}>
          {t("auth.legalPrivacy")}
        </button>
      </p>
      <LegalDocDialog doc={doc} onOpenChange={(next) => !next && setDoc(null)} />
    </>
  );
}
