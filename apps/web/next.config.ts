import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Packages the framework resolves for itself. Never aliased here.
 *
 * `react` / `react-dom`: Next already forces a single copy; duplicating that
 * work risks fighting its own resolution.
 *
 * `next`: the overlay declares it as a peer and imports `next/server`, and the
 * two checkouts do resolve to different copies (15.3.8 vs 15.5.22 at the time of
 * writing). Aliasing framework internals is a worse bet than the duplicate —
 * there is no observed symptom, and `NextResponse` identity is the kind of thing
 * that breaks in non-obvious ways when you reach into it. Recorded as a known
 * duplicate by the report below rather than silently ignored.
 */
const FRAMEWORK_MANAGED = new Set(['react', 'react-dom', 'next']);

/** Next runs the webpack hook once per compilation (client/server/edge); the
 *  aliases are identical each time, so say it once per build. */
let singletonsReported = false;

/**
 * Where a package lives, as a directory.
 *
 * Deliberately not the file `require.resolve` returns: that picks the `require`
 * condition, so aliasing to it would force webpack onto the CommonJS build and
 * give up the ESM one (and its tree-shaking). Aliasing the directory lets
 * webpack apply its own conditions to the package's exports map.
 */
function packageDir(resolveFrom: NodeRequire, dep: string): string | null {
  try {
    return path.dirname(resolveFrom.resolve(`${dep}/package.json`));
  } catch {
    // Not every package exports ./package.json. Fall back to walking up from
    // the entry file to the `node_modules/<dep>` boundary.
    try {
      const entry = resolveFrom.resolve(dep);
      const marker = path.sep + path.join('node_modules', ...dep.split('/'));
      const at = entry.lastIndexOf(marker);
      return at === -1 ? null : entry.slice(0, at + marker.length);
    } catch {
      return null;
    }
  }
}

/**
 * Force one copy of every package the commercial overlay shares with this app.
 *
 * The overlay lives in a separate checkout with its own lockfile, so pnpm gives
 * it its own physical copy of each peer dependency. For a package with
 * module-level state that means two independent instances, and the failure is
 * silent in both directions:
 *
 * - `react-i18next` / `i18next`: the overlay's `useTranslation()` read a context
 *   the app's `I18nextProvider` never filled, so every `t()` in the pricing
 *   modal rendered its own key.
 * - `sonner`: `toast()` published to the overlay's module-level observer while
 *   `<Toaster />` subscribed to the app's, so every toast was dropped.
 *
 * The list is **derived** from what the overlay declares, not hand-maintained:
 * a hand-written list is one more thing to forget when the overlay grows a
 * dependency, and forgetting reproduces exactly the bugs above.
 *
 * `resolve.alias` is the right mechanism here even though it is dead code for
 * the `@/lib/...` slots below — that limitation is specific to requests
 * tsconfig `paths` already claims, and does not apply to bare package names.
 * (Next itself dedupes react this way.)
 */
function shareRuntimeSingletons(
  config: { resolve?: { alias?: Record<string, unknown> } },
  overlayRoots: string[],
) {
  const appDir = process.cwd();
  const appManifest = path.join(appDir, 'package.json');
  if (!fs.existsSync(path.join(appDir, 'node_modules')) || !fs.existsSync(appManifest)) {
    throw new Error(
      `[overlay] expected the Next project at the working directory, found no ` +
        `node_modules/package.json in ${appDir}. Run next from the app directory.`,
    );
  }
  const appRequire = createRequire(appManifest);

  config.resolve = config.resolve ?? {};
  config.resolve.alias = { ...(config.resolve.alias ?? {}) };

  const shared: string[] = [];
  const knownDuplicates: string[] = [];

  for (const root of overlayRoots) {
    const manifest = path.join(root, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const rootRequire = createRequire(manifest);

    for (const dep of Object.keys({ ...pkg.peerDependencies, ...pkg.dependencies })) {
      // Resolvable from both sides, to different directories, is what makes a
      // duplicate. Anything the app does not use has nothing to unify.
      const appCopy = packageDir(appRequire, dep);
      const overlayCopy = packageDir(rootRequire, dep);
      if (!appCopy || !overlayCopy) continue;
      if (fs.realpathSync(appCopy) === fs.realpathSync(overlayCopy)) continue;

      if (FRAMEWORK_MANAGED.has(dep)) {
        knownDuplicates.push(dep);
        continue;
      }
      // Exact-match (`$`) on purpose. A prefix alias would rewrite deep paths
      // like `lucide-react/dist/...` too, bypassing the package's exports map;
      // and the only package here reached by subpath is lucide-react, whose
      // icons hold no state, so a second copy of those costs bytes and nothing
      // else. Everything with module-level state is imported bare.
      config.resolve.alias[`${dep}$`] = appCopy;
      shared.push(dep);
    }
  }

  if (singletonsReported) return;
  singletonsReported = true;
  if (shared.length > 0) {
    console.log(`[overlay] sharing one copy of: ${[...new Set(shared)].sort().join(', ')}`);
  }
  if (knownDuplicates.length > 0) {
    console.warn(
      `[overlay] framework-managed duplicates left alone: ` +
        `${[...new Set(knownDuplicates)].sort().join(', ')} — see FRAMEWORK_MANAGED`,
    );
  }
}

const nextConfig: NextConfig = {
  /**
   * 构建产物目录，可用 `NEXT_DIST_DIR` 覆盖。
   *
   * `next dev` 与 `next build` 默认共用 `.next/`：dev 跑着的时候在同一棵树上跑一次
   * 构建，会把 dev server 脚下的 chunk 整个换掉——dev 仍按旧 manifest 发请求，于是
   * `/_next/static/css/app/layout.css` 之类全部 404，表现为「改完不重新打包就炸」。
   * 因果其实是反的：不是改完要打包，是打包打坏了 dev。
   *
   * 留一个环境变量而不是写死另一个目录：CI / Docker / `pnpm build` 的默认行为完全
   * 不变（未设时仍是 `.next`），只有想在 dev 开着的情况下验证构建时才需要
   * `NEXT_DIST_DIR=.next-verify pnpm build`，两边各写各的目录，互不打扰。
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Magic-Resume commercial overlay alias. Roots are provided only by private commercial builds.
  webpack: (config, { webpack }) => {
    const runtimeRoot = process.env.MAGIC_RESUME_COMMERCIAL_RUNTIME_ROOT;
    const billingRoot = process.env.MAGIC_RESUME_COMMERCIAL_BILLING_ROOT;
    const legalRoot = process.env.MAGIC_RESUME_COMMERCIAL_LEGAL_ROOT;
    if (!runtimeRoot && !billingRoot && !legalRoot) return config;

    const slots: Record<string, string> = {};
    if (runtimeRoot) {
      slots['@/lib/commercial/runtime'] = path.join(runtimeRoot, 'src/runtime.tsx');
      slots['@/lib/extensions/app-lifecycle'] = path.join(runtimeRoot, 'src/app-lifecycle.ts');
    }
    if (billingRoot) {
      slots['@/lib/extensions/billing-client'] = path.join(billingRoot, 'src/billing-client.ts');
      slots['@/lib/extensions/billing-ui'] = path.join(billingRoot, 'src/billing-ui.tsx');
      slots['@/lib/extensions/billing-proxy'] = path.join(billingRoot, 'src/billing-proxy.ts');
    }
    if (legalRoot) {
      // The policy documents. The route shells under `app/legal/` stay in this
      // repo — the overlay has no way to add a route — but everything they
      // render, including the operating entity and its filing numbers, comes
      // from the commercial package.
      slots['@/lib/extensions/legal'] = path.join(legalRoot, 'src/legal.tsx');
    }

    // Must run whenever a slot is swapped in: overlay code entering this bundle
    // is what creates the duplicate-instance problem in the first place.
    shareRuntimeSingletons(config, [runtimeRoot, billingRoot, legalRoot].filter(
      (root): root is string => Boolean(root),
    ));

    // Replacement at the module-factory stage, not `resolve.alias`. These
    // requests start with `@/`, which tsconfig `paths` already claims, and
    // Next's JsConfigPathsPlugin resolves it during `described-resolve` —
    // before AliasPlugin ever runs. An alias keyed on `@/lib/...` is therefore
    // dead code: it never matches, and the slot silently stays on its
    // open-source stub.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^@\/lib\/(commercial\/runtime|extensions\/(app-lifecycle|billing-client|billing-ui|billing-proxy|legal))$/,
        (resource: { request: string }) => {
          const target = slots[resource.request];
          if (target) resource.request = target;
        }
      )
    );
    return config;
  },
  output: "standalone",
  transpilePackages: ['@magic-resume/resume-templates', '@magic-resume/genui'],

  // 分享出去的简历页里是真名 / 电话 / 邮箱 / 履历。页面自己已经声明了
  // `robots: { index: false, follow: false }`，这里再发一遍响应头：meta 只在
  // HTML 文档里有效，而这条对 OG 图、预取、任何非 HTML 响应同样成立，
  // 也不依赖爬虫解析到 <head>。
  async headers() {
    return [
      {
        source: '/s/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        /**
         * PDF 用的 CJK 字体：内容固定、体积巨大（子集 2.4–4.0MB，全量 13–17MB），
         * 必须 immutable。
         *
         * Next.js 对 `public/` 默认发 `Cache-Control: public, max-age=0` —— 只有
         * `_next/static` 才是 immutable。于是每次切换字体档位（sans / serif / kaiti）
         * 都要回服务器验证一次 4MB 的文件；有 ETag 能拿 304 不重传正文，但那一个
         * 往返就摆在用户点下字体到预览刷新之间。
         *
         * 文件名不带内容 hash，所以换字体文件时要改名（或加版本目录），
         * 否则一年内的老客户端拿不到新版。
         */
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  
  // 图片优化
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: '',
        pathname: '/**',
      },
      {
        // Cloudflare R2 头像:public dev URL(*.r2.dev)。绑自定义域名后再加一条。
        protocol: 'https',
        hostname: 'pub-ca5e6f293e274c1b9298cf78d112e0be.r2.dev',
        port: '',
        pathname: '/**',
      }
    ],
    // 优化图片格式
    formats: ['image/avif', 'image/webp'],
    // 启用图片优化
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // 编译优化
  compiler: {
    // 移除console.log (仅生产环境)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },

  // Turbopack配置（现在是稳定功能）
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // 实验性功能
  experimental: {
    // 优化包导入
    optimizePackageImports: [
      'react-icons',
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      '@langchain/core',
    ],
    viewTransition: true,
  },

  // Webpack优化暂时禁用，避免构建错误

  // 静态资源优化
  assetPrefix: process.env.NODE_ENV === 'production' ? undefined : undefined,
  
  // 启用gzip压缩
  compress: true,

  // PoweredByHeader
  poweredByHeader: false,

  // React严格模式
  reactStrictMode: true,

  // 生产环境源码映射（调试用，可关闭以减小体积）
  productionBrowserSourceMaps: false,

  // SWC minification 现在是默认启用的，无需显式配置

  // 后端统一走单一 origin（NEXT_PUBLIC_API_URL）+ 本地网关；
  // 不再用 next.config 注入 BACKEND_URL，也不再做 interview 路径转发。
};

export default nextConfig;
