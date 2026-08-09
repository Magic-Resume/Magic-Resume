# @magic-resume/genui

对话式生成界面（GenUI）的组件工具包：契约、宿主、动效层和通用交互卡片。

**边界**：本包管「怎么显示和交互」，消费方管「显示什么」。widget 注册表、各表单的字段定义、数据源和把用户操作送回 agent 的传输层，都属于消费方——它们是应用与自己 agent 之间的业务契约，进了包就把包污染成业务包。

## 消费方必须提供的两件事

### 1. 主题 token

组件用语义工具类（`bg-raised` / `bg-sunk` / `text-primary` / `text-secondary` / `text-muted` / `border-hairline` / `text-ink-sky` / `bg-tint-sky` / `bg-fill-sky` / `text-on-fill-sky`），本包自身不定义它们。消费方需要在自己的 Tailwind 入口里用 `@theme inline` 把它们映射到主题变量，卡片才会跟随明暗主题；缺 token 时颜色会静默落空。

### 2. Tailwind 源扫描

Tailwind v4 从构建的 cwd 自动探测源文件，**不会扫 workspace 包**。消费方的 CSS 入口必须显式声明：

```css
@import "tailwindcss";
@source "<相对路径>/packages/genui/src";
```

漏了不会报错，只会缺样式——只有那些消费方自己恰好也用到的类才碰巧存在。

## i18n

组件通过 `react-i18next` 的 `useTranslation()` 取文案（`aiLab.widgets.*`），本包不带 i18n 实例也不带词条；消费方负责在外层提供 `I18nextProvider` 和这些 key。

## peerDependencies

`react` / `react-dom` / `react-i18next` / `lucide-react` / `framer-motion` 全部是 peer。framer-motion 尤其不能装成本包的直接依赖——两份实例会让 `AnimatePresence` 的 context 静默失效，退出动画再也不播。
