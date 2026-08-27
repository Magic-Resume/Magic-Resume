"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Clerk 在已有活跃 session 时拒绝再创建 sign-in / sign-up，返回 400 `session_exists`。
 */
export function isSessionExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const errors = (err as { errors?: Array<{ code?: string }> }).errors;
  return Array.isArray(errors) && errors.some((e) => e?.code === "session_exists");
}

/**
 * 已经登录的人不该看到登录表单。
 *
 * middleware 的 `isAuthRoute` 做的是同一件事，但它读的是**服务端** session（`auth()`），
 * 而 Clerk 浏览器端另有一份客户端 session，两者会不同步——开发实例上尤其常见：`__session`
 * cookie 已过期而 FAPI 上的 session 还活着。那一刻 middleware 看不到登录态、于是放行，
 * 页面渲染出登录表单，而每一次提交都被 Clerk 用 400 `session_exists` 挡掉：密码、验证码、
 * GitHub 全都失败，界面上只剩一句通用报错，没有任何东西说明「你其实已经登录了」。
 *
 * 所以这里补的不是 middleware 的重复，而是它结构上看不到的另一半。
 *
 * 返回 true 表示正在跳走，调用方应停止渲染表单。
 */
export function useRedirectIfSignedIn(afterAuth: string): boolean {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || fired.current) return;
    fired.current = true;

    void (async () => {
      // 先把服务端能看到的那半边补齐再走。
      //
      // 客户端有 session，不代表 `__session` cookie 还在——这两者错位正是我们会走到这里的
      // 原因。而 middleware 只认 cookie：这时候直接跳 /dashboard，会被它原地弹回 /sign-in，
      // 人就停在一张空白页上（表单不渲染了，可也没到任何地方去）。`getToken()` 让 Clerk 重新
      // 签发并写回 cookie，跳转才有意义。拿不到就照跳，让服务端给出它的结论，别死在这。
      try {
        await getToken();
      } catch {
        // 忽略：下面照常跳转。
      }
      // 整页跳转而不是 router.replace：要的就是带着刚写回的 cookie 重新过一遍 middleware，
      // 客户端路由不保证这一点。replace 语义保留——这个登录页不该留在后退栈里。
      window.location.replace(afterAuth);
    })();
  }, [isLoaded, isSignedIn, afterAuth, getToken]);

  return Boolean(isLoaded && isSignedIn);
}
