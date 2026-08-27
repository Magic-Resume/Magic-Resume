"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from '@magic-resume/icons';
import { AuthShell } from "./AuthShell";
import { AuthButton, AuthField, FieldError, OtpField } from "./AuthPrimitives";
import { SocialButtons, type OAuthProvider } from "./SocialButtons";
import { getClerkErrorMessage } from "./authErrors";
import { readLastMethod, writeLastMethod, type AuthMethod } from "./lastMethod";
import { afterAuthUrl } from "./afterAuthUrl";
import { isSessionExistsError, useRedirectIfSignedIn } from "./useSignedInRedirect";
import { LegalConsent } from "./LegalConsent";
import { useTermsGate } from "./TermsGate";

const SSO_CALLBACK_URL = "/sso-callback";


type Step = "start" | "email" | "verify";

export default function SignUpCard() {
  const { t } = useTranslation();
  const router = useRouter();
  // Honour the middleware's `redirect_url`, so a lapsed session on
  // /billing/return?orderId=… comes back to that order rather than the
  // dashboard, which would strand the payment.
  const afterAuth = afterAuthUrl(useSearchParams()?.toString());
  const { isLoaded, signUp, setActive } = useSignUp();
  const reduce = useReducedMotion();
  const redirectingSignedIn = useRedirectIfSignedIn(afterAuth);

  const [step, setStep] = React.useState<Step>("start");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingOAuth, setPendingOAuth] = React.useState<OAuthProvider | null>(null);
  // 条款门禁：只包住入口动作，不碰下面任何一步的注册逻辑。
  const terms = useTermsGate();
  const [lastMethod, setLastMethod] = React.useState<AuthMethod | null>(null);

  React.useEffect(() => setLastMethod(readLastMethod()), []);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  /** 见 SignInCard：`session_exists` 是「你已经登录了」，不是错误。 */
  const onAuthError = (err: unknown) => {
    if (isSessionExistsError(err)) {
      router.replace(afterAuth);
      return;
    }
    setError(getClerkErrorMessage(err, t));
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    if (!isLoaded || !signUp) return;
    setError(null);
    setPendingOAuth(provider);
    writeLastMethod(provider);
    try {
      await signUp.authenticateWithRedirect({
        strategy: `oauth_${provider}`,
        redirectUrl: SSO_CALLBACK_URL,
        redirectUrlComplete: afterAuth,
      });
    } catch (err) {
      setPendingOAuth(null);
      onAuthError(err);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      goTo("verify");
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code });
      if (res.status === "complete") {
        writeLastMethod("email");
        await setActive?.({ session: res.createdSessionId });
        router.push(afterAuth);
      } else {
        setError(t("auth.errors.generic"));
      }
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!isLoaded || !signUp) return;
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (err) {
      onAuthError(err);
    }
  };

  // 原地 opacity 交叉淡入:步骤绝对定位重叠,不重排、不留空档 → 不抖。
  const stepAnim = {
    initial: { opacity: reduce ? 1 : 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] as const },
  };

  // 见 SignInCard：已登录时正在跳走，别再渲染注册表单。
  if (redirectingSignedIn) return null;

  return (
    <AuthShell
      mark="sign-up-form"
      title={t("auth.signUp.title")}
      switchPrompt={t("auth.signUp.switchPrompt")}
      switchHref="/sign-in"
      switchLabel={t("auth.signUp.switchLink")}
    >
      <AnimatePresence initial={false}>
        <motion.div key={step} {...stepAnim} className="absolute inset-x-0 top-0 flex flex-col gap-4">
          {step === "start" && (
            <div className="flex flex-col gap-2.5">
              <SocialButtons
                onSelect={(provider) => terms.guard(() => void handleOAuth(provider))()}
                pending={pendingOAuth}
                disabled={!isLoaded}
                lastMethod={lastMethod}
              />
              <AuthButton onClick={terms.guard(() => goTo("email"))} disabled={!isLoaded}>
                {t("auth.continueWith.email")}
              </AuthButton>
              {/* 主动勾选取代了这一步原来的被动 `LegalConsent`——它比「注册即视为同意」
                  更强。`email` 那一步仍保留那句话：那是账号真正被创建的时刻，
                  `LegalConsent` 的注释里对这个位置有过刻意论证。 */}
              <div className="pt-1.5">{terms.checkbox}</div>
              {error && <FieldError>{error}</FieldError>}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={submitCreate} className="flex flex-col gap-4">
              <BackRow label={t("auth.back")} onBack={() => goTo("start")} />
              <AuthField
                label={t("auth.fields.email")}
                type="email"
                autoFocus
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <AuthField
                label={t("auth.fields.password")}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="-mt-1 text-[12px] text-[color:var(--text-muted)]">
                {t("auth.passwordHint")}
              </p>
              {/* Clerk 智能验证码挂载点(若实例开启 bot 防护) */}
              <div id="clerk-captcha" />
              {error && <FieldError>{error}</FieldError>}
              <AuthButton
                type="submit"
                variant="primary"
                loading={busy}
                disabled={!email.trim() || password.length < 8}
              >
                {t("auth.signUp.submit")}
              </AuthButton>
              <LegalConsent />
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={submitVerify} className="flex flex-col gap-4">
              <BackRow label={t("auth.back")} onBack={() => goTo("email")} />
              <p className="text-[13.5px] text-[color:var(--text-secondary)]">
                {t("auth.codeSentTo", { email })}
              </p>
              <OtpField
                autoFocus
                value={code}
                error={Boolean(error)}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              {error && <FieldError>{error}</FieldError>}
              <AuthButton type="submit" variant="primary" loading={busy} disabled={code.length < 6}>
                {t("auth.signUp.verify")}
              </AuthButton>
              <div className="text-center">
                <button
                  type="button"
                  onClick={resendCode}
                  className="text-[13px] font-medium text-ink-sky transition-colors hover:text-ink-sky-hover"
                >
                  {t("auth.resend")}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
      {terms.dialog}
    </AuthShell>
  );
}

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 self-start text-[13px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="max-w-[240px] truncate">{label}</span>
    </button>
  );
}
