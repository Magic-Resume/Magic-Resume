---
title: "Edit a Resume with Claude Code: What Resume MCP Is and How to Use It Safely"
description: "Resume MCP connects Magic Resume to MCP-compatible AI tools while keeping schema validation, patch previews, and user confirmation in the loop."
locale: en
slug: resume-mcp-claude-code
canonical: https://www.magic-resume.cn/en/blog/resume-mcp-claude-code
hreflang:
  - lang: en
    href: https://www.magic-resume.cn/en/blog/resume-mcp-claude-code
  - lang: zh-CN
    href: https://www.magic-resume.cn/zh/blog/resume-mcp-claude-code
author: Magic Resume Editorial
datePublished: 2026-08-27
dateModified: 2026-08-27
primaryIntent: resume MCP Claude Code
tags: [MCP, Claude Code, open source resume]
sources:
  - title: Model Context Protocol
    url: https://modelcontextprotocol.io/introduction
---

## The short answer

Resume MCP is a local connector that lets AI coding tools read and edit Magic Resume resumes through a standard protocol. The safe workflow is not a free-form rewrite: read a defined scope, preview a structured patch, and write only after you confirm it.

### What it can do

- List the resumes you have authorized and read selected content.
- Use the resume schema to locate experience, project, or skill fields.
- Produce a patch preview that shows exactly which fields will change.
- Return to the web editor to review and export a PDF after writing.

MCP is a connection layer, not a second resume database. Permissions and data boundaries still come from the Magic Resume API and your local configuration. Never commit a personal access token or paste a real resume into a public issue.

### A minimal setup flow

1. Install `@magic-resume/mcp`.
2. Create a personal access token in Magic Resume with the smallest useful scope.
3. Configure the local MCP server in Claude Code, Cursor, or Windsurf.
4. Ask it to “list my resumes” and confirm the account.
5. Ask for a preview before applying any edit.

See the complete [MCP resume editor guide](/en/tools/mcp-resume-editor). If you only need to create and export a resume, MCP is optional—the web workbench stands on its own.

MCP is useful because it brings resumes into an existing development workflow while keeping the model's write surface inside verifiable, structured operations.
