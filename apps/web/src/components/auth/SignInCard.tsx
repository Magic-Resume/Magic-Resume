"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from '@magic-resume/icons';
import { AuthShell } from "./AuthShell";
import { AuthButton, AuthField, AuthTextLink, FieldError, OtpField } from "./AuthPrimitives";
import { SocialButtons, type OAuthProvider } from "./SocialButtons";
import { useTermsGate } from "./TermsGate";
import { getClerkErrorMessage } from "./authErrors";
import { readLastMethod, writeLastMethod, type AuthMethod } from "./lastMethod";
import { afterAuthUrl } from "./afterAuthUrl";
import { isSessionExistsError, useRedirectIfSignedIn } from "./useSignedInRedirect";

const SSO_CALLBACK_URL = "/sso-callback";

/** 从 hook 推出来，省得为一个类型把 `@clerk/types` 加成直接依赖。 */
type SignInResource = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;


type Step = "start" | "email" | "password" | "code" | "forgot" | "reset";

export default function SignInCard() {
  const { t } = useTranslation();
  const router = useRouter();
  // Honour the middleware's `redirect_url`, so a lapsed session on
  // /billing/return?orderId=… comes back to that order rather than the
  // dashboard, which would strand the payment.
  const afterAuth = afterAuthUrl(useSearchParams()?.toString());
  const { isLoaded, signIn, setActive } = useSignIn();
  const reduce = useReducedMotion();
  const redirectingSignedIn = useRedirectIfSignedIn(afterAuth);

  const [step, setStep] = React.useState<Step>("start");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingOAuth, setPendingOAuth] = React.useState<OAuthProvider | null>(null);
  // 条款门禁。**只包住入口动作**，不碰下面任何一步的登录逻辑（CLAUDE.md 里那三条例外）。
  const terms = useTermsGate();
  const [lastMethod, setLastMethod] = React.useState<AuthMethod | null>(null);
  // 这个 Clerk 实例对该账号是否支持密码——由 supportedFirstFactors 现场决定，不写死。
  const [passwordAvailable, setPasswordAvailable] = React.useState(false);

  React.useEffect(() => setLastMethod(readLastMethod()), []);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  /**
   * `session_exists` 不是错误，是「你已经登录了」。给它一句看不懂的通用报错，等于把人
   * 留在一个怎么点都失败的表单上；直接送走才是这个状态该有的结果。
   */
  const onAuthError = (err: unknown) => {
    if (isSessionExistsError(err)) {
      router.replace(afterAuth);
      return;
    }
    setError(getClerkErrorMessage(err, t));
  };

  const complete = async (createdSessionId: string | null) => {
    if (!createdSessionId) return;
    writeLastMethod("email");
    await setActive?.({ session: createdSessionId });
    router.push(afterAuth);
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    if (!isLoaded || !signIn) return;
    setError(null);
    setPendingOAuth(provider);
    writeLastMethod(provider);
    try {
      await signIn.authenticateWithRedirect({
        strategy: `oauth_${provider}`,
        redirectUrl: SSO_CALLBACK_URL,
        redirectUrlComplete: afterAuth,
      });
    } catch (err) {
      setPendingOAuth(null);
      onAuthError(err);
    }
  };

  /**
   * 发出邮箱验证码并进入验证码步骤。调用方负责 busy / 错误处理。
   *
   * 用 `create()` 返回的那个 resource 继续，而不是闭包里的 `signIn`：它就是同一个 attempt，
   * 而且类型上已经非空，省掉一个非空断言。
   */
  const startEmailCode = async (attempt: SignInResource) => {
    const factor = attempt.supportedFirstFactors?.find(
      (f) => f.strategy === "email_code",
    );
    const emailAddressId =
      factor && "emailAddressId" in factor ? factor.emailAddressId : undefined;
    if (!emailAddressId) {
      setError(t("auth.errors.generic"));
      return;
    }
    await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId });
    setCode("");
    goTo("code");
  };

  /**
   * 填完邮箱之后走哪一步，由这个 Clerk 实例**实际支持**的第一因素决定。
   *
   * 此前这里无条件跳去密码步骤。而实例上密码可以是关的（本地开发实例就只开了邮箱验证码 +
   * GitHub），那样每个用户填完邮箱都会撞进一个注定失败的密码表单——密码策略压根不存在。
   */
  const continueFromEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: email });
      const hasPassword = (res.supportedFirstFactors ?? []).some(
        (f) => f.strategy === "password",
      );
      setPasswordAvailable(hasPassword);
      if (hasPassword) goTo("password");
      else await startEmailCode(res);
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: email, password });
      if (res.status === "complete") await complete(res.createdSessionId);
      else setError(t("auth.errors.generic"));
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const switchToCode = async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await startEmailCode(await signIn.create({ identifier: email }));
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (res.status === "complete") await complete(res.createdSessionId);
      else setError(t("auth.errors.generic"));
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const sendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email });
      setCode("");
      setNewPassword("");
      goTo("reset");
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code });
      if (res.status === "needs_new_password") {
        const done = await signIn.resetPassword({ password: newPassword });
        if (done.status === "complete") await complete(done.createdSessionId);
        else setError(t("auth.errors.generic"));
      } else if (res.status === "complete") {
        await complete(res.createdSessionId);
      } else {
        setError(t("auth.errors.generic"));
      }
    } catch (err) {
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  // 原地 opacity 交叉淡入:步骤绝对定位重叠,不重排、不留空档 → 不抖。
  const stepAnim = {
    initial: { opacity: reduce ? 1 : 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] as const },
  };

  // 已登录：`useRedirectIfSignedIn` 正在跳走，这一帧不要再把登录表单画出来——它上面的
  // 每个按钮都只会换来一个 400。
  if (redirectingSignedIn) return null;

  return (
    <AuthShell
      mark="sign-in-form"
      title={t("auth.signIn.title")}
      switchPrompt={t("auth.signIn.switchPrompt")}
      switchHref="/sign-up"
      switchLabel={t("auth.signIn.switchLink")}
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
              <div className="pt-1.5">{terms.checkbox}</div>
              {error && <FieldError>{error}</FieldError>}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={continueFromEmail} className="flex flex-col gap-4">
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
              {error && <FieldError>{error}</FieldError>}
              <AuthButton
                type="submit"
                variant="primary"
                loading={busy}
                disabled={!email.trim() || busy}
              >
                {t("auth.continue")}
              </AuthButton>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={submitPassword} className="flex flex-col gap-4">
              <BackRow label={email} onBack={() => goTo("email")} />
              <AuthField
                label={t("auth.fields.password")}
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={
                  <AuthTextLink type="button" onClick={() => goTo("forgot")}>
                    {t("auth.forgotPassword")}
                  </AuthTextLink>
                }
              />
              {error && <FieldError>{error}</FieldError>}
              <AuthButton type="submit" variant="primary" loading={busy} disabled={!password}>
                {t("auth.signIn.submit")}
              </AuthButton>
              <div className="text-center">
                <AuthTextLink onClick={switchToCode} disabled={busy}>
                  {t("auth.useCodeInstead")}
                </AuthTextLink>
              </div>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              {/* 密码没开时压根没经过密码步骤，退回去只会落到一个用不了的表单上。 */}
              <BackRow
                label={t("auth.back")}
                onBack={() => goTo(passwordAvailable ? "password" : "email")}
              />
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
                {t("auth.signIn.submit")}
              </AuthButton>
            </form>
          )}

          {step === "forgot" && (
            <form onSubmit={sendResetCode} className="flex flex-col gap-4">
              <BackRow label={t("auth.back")} onBack={() => goTo("password")} />
              <p className="text-[13.5px] text-[color:var(--text-secondary)]">
                {t("auth.forgot.hint")}
              </p>
              <AuthField
                label={t("auth.fields.email")}
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
              <AuthButton type="submit" variant="primary" loading={busy} disabled={!email.trim()}>
                {t("auth.forgot.send")}
              </AuthButton>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={submitReset} className="flex flex-col gap-4">
              <BackRow label={t("auth.back")} onBack={() => goTo("forgot")} />
              <p className="text-[13.5px] text-[color:var(--text-secondary)]">
                {t("auth.codeSentTo", { email })}
              </p>
              <OtpField
                autoFocus
                value={code}
                error={Boolean(error)}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <AuthField
                label={t("auth.fields.newPassword")}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
              <AuthButton
                type="submit"
                variant="primary"
                loading={busy}
                disabled={code.length < 6 || newPassword.length < 8}
              >
                {t("auth.forgot.reset")}
              </AuthButton>
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
