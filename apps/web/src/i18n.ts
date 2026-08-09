import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
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
    resources: {
      en: {
        translation: en,
      },
      zh: {
        translation: zh,
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

/** 切换语言并持久化到 localStorage（原 LanguageDetector 的缓存职责）。 */
export function setPreferredLanguage(code: "en" | "zh") {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为会话内生效。
  }
  void i18n.changeLanguage(code);
}

export default i18n;
