/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_WEB_ORIGIN?: string;
  /** @deprecated Use PUBLIC_WEB_ORIGIN instead. */
  readonly PUBLIC_APP_ORIGIN?: string;
  /** Search-console ownership codes; see components/SiteVerification.astro. */
  readonly PUBLIC_GOOGLE_SITE_VERIFICATION?: string;
  readonly PUBLIC_BING_SITE_VERIFICATION?: string;
  readonly PUBLIC_BAIDU_SITE_VERIFICATION?: string;
  readonly PUBLIC_SOGOU_SITE_VERIFICATION?: string;
  readonly PUBLIC_SHENMA_SITE_VERIFICATION?: string;
  /** IndexNow key; build-time only, see pages/[indexNowKey].txt.ts. */
  readonly INDEXNOW_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
