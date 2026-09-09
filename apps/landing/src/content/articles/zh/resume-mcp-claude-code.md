---
title: "用 Claude Code 编辑简历：Resume MCP 是什么，如何安全使用"
description: "Resume MCP 把简历读取和编辑接入兼容 MCP 的 AI 工具，同时保留 schema 校验、补丁预览和用户确认。"
locale: zh
slug: resume-mcp-claude-code
canonical: https://www.magic-resume.cn/zh/blog/resume-mcp-claude-code
hreflang:
  - lang: zh-CN
    href: https://www.magic-resume.cn/zh/blog/resume-mcp-claude-code
  - lang: en
    href: https://www.magic-resume.cn/en/blog/resume-mcp-claude-code
author: Magic Resume Editorial
datePublished: 2026-08-27
dateModified: 2026-08-27
primaryIntent: resume MCP Claude Code
tags: [MCP, Claude Code, 开源简历]
sources:
  - title: Model Context Protocol
    url: https://modelcontextprotocol.io/introduction
---

## 先说结论

Resume MCP 是一个让 AI 编程工具通过标准协议读取和修改 Magic Resume 简历的本地连接器。安全的使用方式不是把整份简历交给模型自由重写，而是：读取明确范围、预览结构化补丁、确认后再写入。

### 它能做什么

- 列出你授权的简历并读取指定内容。
- 根据 schema 定位经历、项目或技能字段。
- 在写入前生成 patch preview，展示将改变的字段。
- 写入后继续用网页编辑器检查并导出 PDF。

MCP 是连接层，不是新的简历数据库；权限和数据边界仍由 Magic Resume 的 API 与本地配置决定。不要把个人访问令牌提交到代码仓库，也不要把真实简历粘贴到公开 issue。

### 推荐的最小流程

1. 安装 `@magic-resume/mcp`。
2. 在 Magic Resume 创建个人访问令牌，并只授予必要范围。
3. 在 Claude Code、Cursor 或 Windsurf 中配置本地 MCP server。
4. 先问“列出我的简历”，确认连接到的是正确账户。
5. 要求模型先生成预览，再决定是否应用修改。

完整步骤见 [MCP 文档](/zh/tools/mcp-resume-editor)。如果你只想制作和导出简历，不需要安装 MCP；网页版工作台已经可以独立完成这条路径。

MCP 的价值在于把简历纳入你已有的开发工作流，同时把“模型能改什么”限制在可验证的结构化操作里。
