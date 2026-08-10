/**
 * Clerk 的报错 → 用户看得懂的话。
 *
 * Clerk 回的是英文 `ClerkAPIError`（`{ code, message, longMessage }`）。整段丢给中文
 * 用户等于没报错——尤其"密码强度不够"和"旧密码不对"这两种，用户必须知道是哪一种才知道
 * 下一步做什么。
 *
 * **只映射有把握的那几条，其余回退到 Clerk 自己的 longMessage。** 穷举错误码是做不完
 * 的，而映射错比不映射更糟：把"验证码过期"说成"验证码错误"，用户会一直重输同一个码。
 */
type ClerkLikeError = {
  errors?: { code?: string; message?: string; longMessage?: string }[];
};

const KNOWN: Record<string, string> = {
  form_password_incorrect: 'account.security.errors.passwordIncorrect',
  form_password_pwned: 'account.security.errors.passwordPwned',
  form_password_length_too_short: 'account.security.errors.passwordTooShort',
  form_password_validation_failed: 'account.security.errors.passwordWeak',
  form_code_incorrect: 'account.security.errors.codeIncorrect',
  verification_expired: 'account.security.errors.codeExpired',
  form_param_format_invalid: 'account.security.errors.codeIncorrect',
};

export function clerkErrorMessage(
  err: unknown,
  t: (key: string) => string
): string {
  const first = (err as ClerkLikeError)?.errors?.[0];
  if (!first) {
    return err instanceof Error ? err.message : t('account.security.errors.unknown');
  }
  const key = first.code ? KNOWN[first.code] : undefined;
  // 回退顺序：已知映射 → Clerk 的完整说明 → 简短消息 → 兜底。
  return key ? t(key) : first.longMessage || first.message || t('account.security.errors.unknown');
}
