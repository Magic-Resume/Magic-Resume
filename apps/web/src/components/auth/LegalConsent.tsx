"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

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
 * `target="_blank"` on purpose: a half-filled sign-up form must survive someone
 * going to read what they are agreeing to.
 */
export function LegalConsent() {
  const { t } = useTranslation();

  return (
    <p className="mt-1 text-center text-[12px] leading-relaxed text-[color:var(--text-muted)]">
      {t("auth.legalConsent")}{" "}
      <Link
        href="/legal/terms"
        target="_blank"
        rel="noreferrer"
        className="text-ink-sky underline underline-offset-2 transition-colors hover:text-ink-sky-hover"
      >
        {t("auth.legalTerms")}
      </Link>{" "}
      {t("auth.legalAnd")}{" "}
      <Link
        href="/legal/privacy"
        target="_blank"
        rel="noreferrer"
        className="text-ink-sky underline underline-offset-2 transition-colors hover:text-ink-sky-hover"
      >
        {t("auth.legalPrivacy")}
      </Link>
    </p>
  );
}
