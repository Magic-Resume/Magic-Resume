import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zh from "./locales/zh/translation.json";

/** 语言偏好持久化 key（与 i18next-browser-languagedetector 默认一致）。 */
export const LANGUAGE_STORAGE_KEY = "i18nextLng";

/**
 * 默认语言固定为 zh，与根 <html lang="zh-CN"> 一致。
 *
 * 之前这里挂载了 i18next-browser-languagedetector：SSR 时 Node 环境拿不到
 * localStorage / navigator，检测失败回退 fallbackLng "en"，于是服务端渲染英文、
 * 客户端 hydration 渲染中文，导致 React hydration mismatch。因此不再用
 * LanguageDetector 参与初始化，SSR 与客户端首渲染始终同为默认语言；
 * 用户的真实语言偏好在水合后由 I18nProvider 的 effect 应用。
 */
i18n
  .use(initReactI18next)
  .init({
    lng: "zh",
    fallbackLng: "zh",
    debug: false,
    // 只内联默认语言。英文包约 30 KB（gzip），此前随每个页面的首屏一起下载，
    // 而绝大多数会话从头到尾都是中文；改为切换到英文时再加载（见 `loadLanguage`）。
    resources: {
      zh: {
        translation: zh,
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

/** 确保语言包已注册。`changeLanguage` 之前必须先等它，否则会先按 fallback 渲染成中文。 */
async function loadLanguage(code: "en" | "zh") {
  if (i18n.hasResourceBundle(code, "translation")) return;
  const { default: bundle } = await import("./locales/en/translation.json");
  i18n.addResourceBundle(code, "translation", bundle);
}

/** 先加载语言包再切换。 */
export async function applyLanguage(code: "en" | "zh") {
  await loadLanguage(code);
  await i18n.changeLanguage(code);
}

/** 切换语言并持久化到 localStorage（原 LanguageDetector 的缓存职责）。 */
export function setPreferredLanguage(code: "en" | "zh") {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为会话内生效。
  }
  void applyLanguage(code);
}

export default i18n;
