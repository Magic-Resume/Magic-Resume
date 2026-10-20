# Dashboard 更新公告

`WhatsNewHost` 挂在 Dashboard 公共布局。仅在云端登录身份确认后请求当前用户的 featured 公告，不会自动打开弹窗。公告出现为右下角提示卡片；用户点击后打开分页介绍，内容成功获得后调用现有通知已读接口。已读后的缓存更新不会卸载正在查看的弹窗。

已有 `NotificationRealtimeProvider` 收到公告 SSE 后，Host 重新查询 featured；查看过程中收到新公告会在关闭当前弹窗后刷新，避免中途替换内容。账号切换隔离缓存与组件状态，后台查询失败不影响 Dashboard。

关闭提示调用 `/api/announcements/:id/dismiss`，服务器持久化到该收件人的 dismissedAt，不计入已读；刷新或换设备后保持关闭。通知中心和已有 `?campaign=...` 链接仍可打开历史详情；结构化更新使用同一个 What’s New 弹窗，普通公告或不支持的 presentation 版本回退到正文弹窗。

组件位于 `src/components/announcements/`，运行时数据校验与转换位于 `src/lib/announcements/presentation.ts`。服务器内容只接受 JSON 图片和站内链接，不接受 ReactNode/任意 HTML。中英文控件文案位于 locales，内容文案由公告编辑者提供。字体单独托管在 public/fonts/whats-new-geist.woff2，样式不覆盖 Dashboard 全局字体。

生产构建、TypeScript、变更文件的 i18n 检查通过；新增转换契约测试已接入 test:unit。浏览器验收页在工作区 references/whats-new-integration-qa，复用实际编辑器、Dashboard Host 和通知详情组件，API 使用隔离的本地模拟数据；真实 Postgres 的服务查询与迁移另由 Core 集成测试覆盖。未向真实用户发送公告。

上线先部署 Core 与新增迁移，再部署 Admin 和 Web。
