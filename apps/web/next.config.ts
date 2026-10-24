import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 构建产物目录，可用 `NEXT_DIST_DIR` 覆盖。
   *
   * Next 16 起 `next dev` 写到 `.next/dev`、`next build` 写到 `.next`，两者可以同时跑，
   * 不再需要靠换目录避免构建把 dev 脚下的 chunk 换掉。这个变量保留给已经在用
   * `.next-verify` 的脚本与 turbo 缓存配置；未设时仍是 `.next`。
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
   * 构建只检查应用代码。测试和 `scripts/` 由测试命令自己负责类型：v3 删掉云端与 AI
   * 之后，有一批测试还引用着已删除的模块，要等接入测试框架时统一重整，不应挡住构建。
   */
  typescript: {
    tsconfigPath: "tsconfig.build.json",
  },

  output: "standalone",
  transpilePackages: ['@magic-resume/resume-templates'],

  async headers() {
    return [
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

  // Turbopack 配置。Next 16 起 dev 与 build 默认都走 Turbopack，文件系统缓存默认开启。
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
    /**
     * 默认 `true` = dev 一启动就把**全部**入口（38 page + 18 route + 6 layout）
     * 预加载进同一个 compilation，于是任何一个新入口都要在整张图上重建：一条只
     * import 四个本地文件的 API 路由因此报 17,526 modules、编译 22.4s。
     *
     * 关掉改为按需编译。代价是每条路由首次访问时才编译（慢几秒），换来的是不再为
     * 这次开发根本没打开过的路由付重建成本。
     */
    preloadEntriesOnStart: false,
    /** 大型 compilation 下少留内存。webpack 模式（`--webpack`）专用，默认 false。 */
    webpackMemoryOptimizations: true,
    // 优化包导入。只列真的装了的——`react-icons` 与 `@radix-ui/react-icons` 都不在
    // 依赖里，列着是死配置（图标现在走 @magic-resume/icons → @hugeicons）。
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
    ],
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
};

export default nextConfig;
