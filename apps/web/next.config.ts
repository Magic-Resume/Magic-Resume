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
 * 别名是这里的正确机制，尽管它对下面那些 `@/lib/...` 槽是死代码——那个限制只针对
 * tsconfig `paths` 已经认领的请求，对裸包名不适用。（Next 自己就是这么去重 react 的。）
 *
 * 返回一张 `包名 → 目录` 的表而不是直接改 config：webpack 要 `dep$` 的精确匹配语法，
 * Turbopack 的 `resolveAlias` 要裸键，同一份计算结果得能翻译成两种写法。
 */
function runtimeSingletonPackages(
  overlayRoots: string[],
): Record<string, string> {
  if (overlayRoots.length === 0) return {};
  const appDir = process.cwd();
  const appManifest = path.join(appDir, 'package.json');
  if (!fs.existsSync(path.join(appDir, 'node_modules')) || !fs.existsSync(appManifest)) {
    throw new Error(
      `[overlay] expected the Next project at the working directory, found no ` +
        `node_modules/package.json in ${appDir}. Run next from the app directory.`,
    );
  }
  const appRequire = createRequire(appManifest);

  const packages: Record<string, string> = {};
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
      packages[dep] = appCopy;
      shared.push(dep);
    }
  }

  if (singletonsReported) return packages;
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
  return packages;
}

/**
 * dev 下 overlay 必须**显式选择**：env 配了 root，并且命令行带了 `--commercial`
 * （由 `scripts/dev.mjs` 翻成这个变量）。此前只要 `.env.local` 里有 root 就一直带着
 * 商业化仓跑，想要一个干净的开源环境只能去注释环境变量。
 *
 * **生产构建不设这道门**：它由 `Magic-Resume-Commercial/scripts/build-commercial-web.mjs`
 * 显式注入 root 驱动，那里不存在「顺手带上」；给它再加一个开关，只是多一个能忘、
 * 而且忘了就静默掉付费墙的地方。
 */
/**
 * 这个 key 是**配置加载时求值**的，不像 `webpack()` 那样按需调用。不加这道判断，
 * webpack 模式下也会白跑一遍单例解析（要读若干 package.json 并解析依赖），
 * 结果还没人用。
 */
function usingTurbopack(): boolean {
  return process.argv.includes('--turbopack');
}

function commercialOptIn(): boolean {
  if (process.env.NODE_ENV !== 'development') return true;
  return process.env.MAGIC_RESUME_COMMERCIAL === '1';
}

/** overlay 的三个 root。都没配 = 开源构建，槽留在自带的桩上。 */
function overlayRoots() {
  return {
    runtime: process.env.MAGIC_RESUME_COMMERCIAL_RUNTIME_ROOT,
    billing: process.env.MAGIC_RESUME_COMMERCIAL_BILLING_ROOT,
    legal: process.env.MAGIC_RESUME_COMMERCIAL_LEGAL_ROOT,
  };
}

/**
 * `槽请求 → overlay 实现文件`。
 *
 * 提到顶层而不是留在 `webpack()` 里：Turbopack 根本不读那个钩子，而两个 bundler 必须
 * 换进同一批文件。只有一份计算结果，才不会出现「webpack 下有付费墙、Turbopack 下没有」。
 */
function overlaySlots(): Record<string, string> {
  if (!commercialOptIn()) return {};
  const { runtime, billing, legal } = overlayRoots();
  const slots: Record<string, string> = {};
  if (runtime) {
    slots['@/lib/commercial/runtime'] = path.join(runtime, 'src/runtime.tsx');
    slots['@/lib/extensions/app-lifecycle'] = path.join(runtime, 'src/app-lifecycle.ts');
  }
  if (billing) {
    slots['@/lib/extensions/billing-client'] = path.join(billing, 'src/billing-client.ts');
    slots['@/lib/extensions/billing-ui'] = path.join(billing, 'src/billing-ui.tsx');
    slots['@/lib/extensions/billing-proxy'] = path.join(billing, 'src/billing-proxy.ts');
  }
  if (legal) {
    // The policy documents. The route shells under `app/legal/` stay in this
    // repo — the overlay has no way to add a route — but everything they
    // render, including the operating entity and its filing numbers, comes
    // from the commercial package.
    slots['@/lib/extensions/legal'] = path.join(legal, 'src/legal.tsx');
  }
  return slots;
}

/** 配了 root 的那几个 overlay 根目录，供单例去重扫描。 */
function activeOverlayRoots(): string[] {
  if (!commercialOptIn()) return [];
  return Object.values(overlayRoots()).filter(
    (root): root is string => Boolean(root),
  );
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

  /**
   * 开发期陈列 / 验收页（`src/app/mock/**`）用 `page.dev.tsx`，生产构建里**根本不是路由**。
   *
   * 此前它们叫 `page.tsx`，靠组件里一行 `NODE_ENV === 'production' 时 return null`
   * 兜底——那是渲染时返回空，不是路由不存在：线上访问拿到的是 200 空白页，而整页
   * 的假数据和依赖照样打进 chunk 发出去了。挡住一个页面要在构建这一层挡，不能靠
   * 页面自己客气。
   */
  pageExtensions:
    process.env.NODE_ENV === 'production'
      ? ['tsx', 'ts', 'jsx', 'js']
      : ['tsx', 'ts', 'jsx', 'js', 'dev.tsx', 'dev.ts'],

  /**
   * `onnxruntime-web`（端侧 VAD 的运行时）里有一处动态 `require`，webpack 静态分析不了，
   * 于是每次编译刷四条 `Critical dependency` 警告。那是库自身的形态，改不了也不影响运行
   * ——我们只用 wasm 后端，走的是它的 `onnxruntime-web/wasm` 子路径。
   *
   * 只静音这一个模块的这一类警告，别的照旧。
   */
  webpack: (config, { webpack }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules[\\/].*onnxruntime-web[\\/]/,
        message: /Critical dependency: require function is used/,
      },
    ];
    const slots = overlaySlots();
    if (Object.keys(slots).length === 0) return config;

    // Must run whenever a slot is swapped in: overlay code entering this bundle
    // is what creates the duplicate-instance problem in the first place.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...(config.resolve.alias ?? {}) };
    for (const [dep, dir] of Object.entries(
      runtimeSingletonPackages(activeOverlayRoots()),
    )) {
      // Exact-match (`$`) on purpose. A prefix alias would rewrite deep paths
      // like `lucide-react/dist/...` too, bypassing the package's exports map;
      // and the only package here reached by subpath is lucide-react, whose
      // icons hold no state, so a second copy of those costs bytes and nothing
      // else. Everything with module-level state is imported bare.
      (config.resolve.alias as Record<string, unknown>)[`${dep}$`] = dir;
    }

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
    /**
     * 和上面 `webpack()` 换的是同一批文件。**Turbopack 不读那个钩子**，所以槽必须在
     * 这里再声明一次；漏掉不会报错，只会让付费墙、法务文案、埋点一起无声消失。
     * `instrumentation.ts` 的断言就是为这个失败模式准备的。
     *
     * 单例去重在这里用裸键：`dep$` 是 webpack 的精确匹配语法，Turbopack 不认。
     */
    resolveAlias: usingTurbopack()
      ? { ...overlaySlots(), ...runtimeSingletonPackages(activeOverlayRoots()) }
      : {},
  },

  // 实验性功能
  experimental: {
    /**
     * 默认 `true` = dev 一启动就把**全部**入口（38 page + 18 route + 6 layout）
     * 预加载进同一个 compilation，于是任何一个新入口都要在整张图上重建：一条只
     * import 四个本地文件的 API 路由因此报 17,526 modules、编译 22.4s。
     *
     * 关掉改为按需编译。代价是每条路由首次访问时才编译（慢几秒），换来的是不再为
     * 这次开发根本没打开过的路由付重建成本。
     */
    preloadEntriesOnStart: false,
    /** 大型 compilation 下少留内存。webpack 模式专用，默认 false。 */
    webpackMemoryOptimizations: true,
    // 优化包导入。只列真的装了的——`react-icons` 与 `@radix-ui/react-icons` 都不在
    // 依赖里，列着是死配置（图标现在走 @magic-resume/icons → @hugeicons）。
    optimizePackageImports: [
      'lucide-react',
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
  // 不再注入独立 agent 地址，也不再做 interview 路径转发；所有请求交给网关按路径路由。
};

export default nextConfig;
