---
title: 前端文案规范：专业语气
type: spec
status: Implemented
owner: kaihuang
created: 2026-09-27
updated: 2026-09-27
summary: 把 Web、Landing 与组件内硬编码文案从口语化改为专业、克制、可信的书面语气：语气与人称规则、句式模板、术语表、中英文排版，以及约 70 条「现 → 改」样例。
scope: [apps/web, apps/landing]
repos: [Magic-Resume]
related: [../../reviews/2026-09-26-ui-copy-audit.md, ../../../.impeccable.md]
---

# 前端文案规范：专业语气

> 一句话：文案只做两件事——说清发生了什么，告诉用户下一步怎么做。不撒娇、不拟人、不用语气词。

## 背景

PR #227 按 `docs/reviews/2026-09-26-ui-copy-audit.md` 重构了文案。那份审查以 `.impeccable.md` 里「呆萌外表·温暖俏皮」为语气基线，结果文案整体偏向口语，例如「登录没成，再试一次」「草稿好啦」「呀，我这边卡住了——歇一小会儿再试一次」「拿得出手了，再抠一遍数字会更狠」。

本规范取代那份审查中的**语气建议**。审查里术语统一、标点、事实错误、硬编码穿帮这几类结论仍然有效，PR #227 的「中文无句号」与「人称用你」两条也继续保留。

适用范围：`apps/web/src/locales/{zh,en}`、`apps/landing/src/i18n/{zh,en}.json`，以及 `apps/web/src` 下没有走 i18n 的界面文案。

## 1. 语气

专业、克制、可信。先说事实，再给操作。

| 做                                             | 不做                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| 书面、准确的动词：失败、已保存、暂无、正在生成 | 口语动词：没成、没能、搞定、挂了、抠、喊我、接着改              |
| 陈述句，句子短                                 | 语气词：呀、啦、吧、呢、哦、嘛、嗨                              |
| 已知原因写清楚，不知道原因就只写结果和操作     | 编造原因，或用「出了点问题」这类零信息的兜底                    |
| 用逗号或分号连接分句                           | 用破折号制造口语停顿（「——歇一小会儿」）                        |
| 客观评价，指出下一步改哪里                     | 调侃、夸张、网络用语（「更狠」「真面」「基本盘」）              |
| AI 以功能主体出现：「AI 将…」                  | AI 自称「我」撒娇或卖萌（「我接不上了」「这份简历不太需要我」） |

## 2. 人称

- **默认不写人称**。「在多台设备间同步简历」优于「在你的多台设备间同步你的简历」。
- **必须写时用「你」**，不用「您」。
- **AI 不自称「我」**：状态、报错、空状态、评语里一律不用第一人称。唯一的例外是对话开场白，可以用「我」，但要克制，例如「我可以协助优化简历、分析岗位匹配度或模拟面试」。
- **「我们」只用于服务方声明**：告警、条款更新、账单等以公司身份说话的场合。
- **第三人称不分性别**：指代他人时用「对方」，不用「他」或「她」。

## 3. 句式模板

| 场景           | 模板                                       | 正例                                          | 反例                                           |
| -------------- | ------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| 失败           | `{对象}{动作}失败[，{已知原因}]，请{操作}` | 简历导出失败，请重试                          | 导出简历没成功，再试一次                       |
| 多次失败的补充 | `…，请重试；如多次失败，请{排查操作}`      | 登录失败，请重试；如多次失败，请检查网络连接  | 登录没成，再试一次；反复失败就检查网络         |
| 部分成功       | `{失败部分}失败，已{兜底动作}`             | 云端删除失败，已从本地移除                    | 云端删除没成功，已在本地先移除                 |
| 成功           | `{对象}已{动作}`                           | 设置已保存；简历「{{name}}」已复制            | 项目已成功复制；重命名成功                     |
| 空状态         | `暂无{对象}`，可附「，可{操作}」           | 暂无分析结果，可发起一次简历分析              | 还没有分析结果——喊我做一次体检就有啦           |
| 加载 / 进度    | `正在{动作}…`                              | 正在读取简历…                                 | 正在翻你的简历…                                |
| 确认弹窗       | 标题用问句，正文写后果                     | 删除求职画像？ / 删除后，AI 将仅提供通用建议… | 删掉之后，AI 会退回通用建议——它不再知道…       |
| 按钮           | 动词或动宾结构，2–6 字                     | 重新生成；用于优化简历                        | 再来一版；拿它优化简历                         |
| 说明文字       | 陈述功能与规则，不写情绪                   | AI 记录的个人背景与偏好，可随时删除有误的条目 | 这里是 AI 记住的关于你的事，记错了随时可以删掉 |

「成功」类不写「成功」二字：「已导出」即可，不写「导出成功」「已成功导出」。

## 4. 中文标点与排版

- **无句号**（沿用 PR #227）：单句不加句号；多个分句用「，」或「；」连接。
- **全角标点**：，；：？！（）「」。引用界面上的名称或用户内容用直角引号「」，不用英文双引号。
- **省略号**只用「…」，不用 `...`。
- **不用叹号**。
- **空格**：中文与英文、数字之间加一个空格（「19 套模板」「PDF 导出失败」）；与全角标点之间不加。
- **用字**：「其他」不写「其它」；「登录」不写「登陆」；「账号」统一，不写「帐号」。

## 5. 术语表

每个概念只保留一种说法。

| 概念                   | 统一用词                                | 不再使用                                         |
| ---------------------- | --------------------------------------- | ------------------------------------------------ |
| 简历的云端存储功能     | 云端同步                                | 云同步、同步中（作功能名时）                     |
| 仅保存在本机           | 本地存储                                | 本地模式                                         |
| 大语言模型             | 模型                                    | 大模型                                           |
| AI 助手（句中指代）    | AI                                      | 它、智能体（只保留在需要区分多个 AI 角色的地方） |
| AI 助手（品牌名）      | Polaris（只用于标题、按钮、发送者名称） | 小宠                                             |
| 付费的用量单位         | 额度                                    | 点数、次数（作计量单位时）                       |
| 订阅档位               | 套餐；升级套餐                          | 计划、档位                                       |
| 五维评估这项能力       | 简历分析                                | 体检、诊断                                       |
| 简历与岗位的比对       | 岗位匹配；匹配度                        | 离岗位还差多远                                   |
| 模拟面试这项能力       | 模拟面试                                | 面试间、真面                                     |
| 招聘方发布的岗位要求   | 职位描述（JD）；首次出现后可只写 JD     | 岗位描述、招聘要求                               |
| 对 AI 修改提案的处理   | 采纳 / 放弃                             | 接受、丢弃、拒绝、跳过（指同一动作时）           |
| 用户的求职背景档案     | 求职画像                                | 画像（单独出现时）                               |
| 简历中的一段经历或条目 | 条目                                    | 项目（易与「项目经历」混淆）                     |

## 6. 英文规则

- **语气对齐中文**：信息量与中文一致，不额外添加俏皮话，不删减中文里的操作指引。
- **不用**：Oops、Hmm、Hi!、叹号，也不用俚语和比喻（give it a beat、buffing、chewing on it、size up）。
- **不用缩写**：写 do not / cannot / could not，不写 don't / can't / couldn't；所有格（today's）不受影响。
- **句首大写**（sentence case）：按钮、标题、标签都只大写首词和专有名词，例如 Start optimization、Quick themes。
- **句号**：标签、按钮、单个短语的提示不加句号；完整句子加句号；多句说明每句都加句号。
- **人称**：用 you 指用户；AI 不自称 I；服务方声明可以用 we。
- **引号**：统一用直双引号 `"{{name}}"`，不混用弯引号 `“ ”`。

## 7. Landing 营销文案

营销页可以有节奏感：标题允许对仗、短句和留白，例如「先提案 / 后改动」。正文仍然按第 1–5 节执行：

- 不用口语动词（「换台设备接着改」「你说了算」「写了出来」）。
- AI 不写成「它」，统一称 AI。
- 不承诺无法验证的效果。

## 8. 例外

**用户口吻的文案**：以用户身份发给 AI 的指令或自述，保留用户的第一人称「我」，只把措辞改规范。这类包括：

- 快捷指令，例如 `aiLab.artifact.match.useKeywordPrompt`、`aiLab.widgets.applicationTracker.actions.calculate`、`WelcomeSuggestions.tsx` 里的建议问题
- onboarding 选项里用户的自我描述，例如 `onboarding.fields.blocker.options.*`
- 示例文本，例如 `aiLab.interview.prompt` 这类面试官示例问句，保持真实口吻

**不属于界面文案，不改**：

- 专有名词字典：`src/lib/constants/dictionaries/{schools,roles,majors}.ts`、`src/lib/constants/modals.ts`
- 法务文本：`src/app/legal/**`
- 代码注释和日志

## 9. 样例对照

「现」为 PR #227 分支上的当前文本。英文列给出修改后的译文。

### 9.1 报错与失败

| key                                       | 现（中）                                                                 | 改（中）                                                         | 改（英）                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `auth.errors.generic`                     | 登录没成，再试一次；反复失败就检查网络                                   | 登录失败，请重试；如多次失败，请检查网络连接                     | Sign-in failed. Try again, and check your network connection if the problem persists.                             |
| `errors.unknown`                          | 出了点问题，请稍后重试                                                   | 操作失败，请稍后重试                                             | The request failed. Please try again later.                                                                       |
| `errors.internal_error`                   | 出了点问题，我们已经收到告警                                             | 服务异常，我们已收到告警并正在处理                               | A server error occurred. We have been alerted and are looking into it.                                            |
| `errors.rate_limited`                     | 请求太密集了，{{retryAfter}}后再试                                       | 请求过于频繁，请在 {{retryAfter}}后重试                          | Too many requests. Try again in {{retryAfter}}.                                                                   |
| `errors.session_invalid`                  | 这段对话已经失效了，开一段新的继续                                       | 对话已失效，请新建对话                                           | This conversation has expired. Start a new conversation.                                                          |
| `errors.not_found`                        | 没找到这个内容，它可能已经被删除了                                       | 内容不存在或已被删除                                             | This content does not exist or has been deleted.                                                                  |
| `errors.plan_required`                    | 当前套餐还用不了这个能力，升级后即可继续                                 | 当前套餐不支持此功能，升级套餐后即可使用                         | Your current plan does not include this feature. Upgrade your plan to use it.                                     |
| `errors.content_rejected`                 | 这份内容没能通过审核，换个说法或换份文件再试                             | 内容未通过审核，请修改内容或更换文件后重试                       | This content did not pass review. Revise it or use a different file, then try again.                              |
| `agentErrors.insufficient_quota`          | 额度用完了，充值，或在设置里配一个自己的模型                             | 额度不足，请充值或在设置中配置自定义模型                         | Insufficient credits. Top up or configure a custom model in Settings.                                             |
| `agentErrors.agent_run_failed`            | 这次没能完成，再试一次；反复失败就检查模型配置                           | 任务执行失败，请重试；如多次失败，请检查模型配置                 | The task failed. Try again, and check your model configuration if the problem persists.                           |
| `aiLab.error.serviceUnavailable`          | 呀，我这边卡住了——歇一小会儿再试一次                                     | AI 服务暂时不可用，请稍后重试                                    | The AI service is temporarily unavailable. Please try again later.                                                |
| `export.notifications.unknownError`       | 导出没能完成，重试一次；反复失败就换个格式                               | 导出失败，请重试；如多次失败，请尝试其他格式                     | Export failed. Try again, or use a different format if the problem persists.                                      |
| `tools.exportPDFError`                    | PDF 导出没成功，换个浏览器或再试一次                                     | PDF 导出失败，请重试或更换浏览器                                 | PDF export failed. Try again or use a different browser.                                                          |
| `common.notifications.copyFailed`         | 复制没成功，再点一次                                                     | 复制失败，请重试                                                 | Copy failed. Please try again.                                                                                    |
| `basicForm.avatarUpload.errors.TOO_LARGE` | 图片太大了，换一张小一点的                                               | 图片过大，请上传更小的文件                                       | The image is too large. Upload a smaller file.                                                                    |
| `store.notifications.deleteCloudFailed`   | 云端删除没成功，已在本地先移除                                           | 云端删除失败，已从本地移除                                       | Cloud deletion failed. The resume was removed from this device.                                                   |
| `aiLab.attach.reject.unsupported`         | 「{{name}}」这个格式还读不了                                             | 不支持「{{name}}」的文件格式                                     | The file format of "{{name}}" is not supported.                                                                   |
| `aiLab.history.restoreFailed`             | 历史记录这会儿读不到，先开了一场新对话；记录没有丢，稍后重新打开就能看到 | 历史记录加载失败，已新建对话；原有记录未丢失，可稍后重新打开查看 | History could not be loaded, so a new conversation was started. Your history is intact and can be reopened later. |
| `aiLab.search.quota`                      | 今天的搜索额度用完了                                                     | 今日搜索额度已用完                                               | Today's search quota has been used up.                                                                            |
| `notFoundPage.title`                      | 这个页面不在了                                                           | 页面不存在                                                       | Page not found                                                                                                    |
| `notFoundPage.description`                | 链接可能已过期，或者内容已被移到别处                                     | 链接可能已失效，或内容已被移动                                   | The link may have expired, or the content has been moved.                                                         |

### 9.2 成功提示

| key                                    | 现（中）                   | 改（中）                | 改（英）                      |
| -------------------------------------- | -------------------------- | ----------------------- | ----------------------------- |
| `sections.notifications.sectionAdded`  | {{label}} 部分已成功添加   | 「{{label}}」已添加     | "{{label}}" added             |
| `sections.notifications.itemRemoved`   | 项目已成功移除             | 条目已删除              | Item deleted                  |
| `sections.notifications.itemCopied`    | 项目已成功复制             | 条目已复制              | Item duplicated               |
| `store.notifications.resumeDuplicated` | 简历 "{{name}}" 已成功复制 | 简历「{{name}}」已复制  | Resume "{{name}}" duplicated  |
| `store.notifications.renameSuccess`    | 重命名成功                 | 已重命名                | Renamed                       |
| `common.notifications.copySuccess`     | JSON数据已复制到剪贴板     | JSON 数据已复制到剪贴板 | JSON data copied to clipboard |
| `modals.export.imageSuccess`           | 图片导出成功               | 图片已导出              | Image exported                |
| `editPage.ai.narrate.draftDone`        | 草稿好啦                   | 草稿已生成              | Draft generated               |

### 9.3 空状态

| key                                                 | 现（中）                                                         | 改（中）                                           | 改（英）                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `aiLab.artifact.emptyAnalysis`                      | 还没有分析结果——喊我做一次体检就有啦                             | 暂无分析结果，可发起一次简历分析                   | No analysis yet. Run a resume analysis to see results.                                   |
| `aiLab.artifact.match.empty`                        | 还没有匹配结果，把目标 JD 贴给我，我来看看这份简历离岗位还差多远 | 暂无匹配结果，粘贴目标职位描述后即可查看岗位匹配度 | No match report yet. Paste a target job description to see how well this resume matches. |
| `knowledge.timelines.empty.title`                   | 这里还空着                                                       | 暂无符合条件的内容                                 | No matching items                                                                        |
| `knowledge.timelines.empty.hint`                    | 换个筛选条件，或者过几天再来看看                                 | 可调整筛选条件，或稍后再查看                       | Adjust the filters or check again later.                                                 |
| `settings.memory.empty`                             | 还没有记住任何事，多聊几次或做几场模拟面试，这里就会有内容       | 暂无记忆，使用 AI 对话或模拟面试后会自动记录       | No memories yet. They are recorded automatically as you use AI chat and mock interviews. |
| `aiLab.widgets.applicationTracker.emptyDescription` | 告诉我公司和岗位，我会把第一条加入面板                           | 提供公司与岗位信息后，即可添加第一条投递记录       | Provide a company and role to add the first application.                                 |
| `account.billing.noOrders`                          | 还没有付款记录                                                   | 暂无付款记录                                       | No payments yet                                                                          |
| `aiLab.interview.report.emptyHint`                  | 多答几题，这里就会逐题告诉你怎么改                               | 完成更多题目后，此处将提供逐题改进建议             | Answer more questions to see feedback for each one here.                                 |

### 9.4 加载与进度

| key                             | 现（中）                | 改（中）                   | 改（英）                                           |
| ------------------------------- | ----------------------- | -------------------------- | -------------------------------------------------- |
| `editPage.ai.narrate.reading`   | 正在翻你的简历…         | 正在读取简历…              | Reading resume…                                    |
| `editPage.ai.narrate.thinking`  | 想想怎么改最好…         | 正在分析修改方案…          | Analyzing changes…                                 |
| `editPage.ai.narrate.polishing` | 再磨磨措辞…             | 正在优化措辞…              | Refining wording…                                  |
| `editPage.ai.narrate.still`     | 这句有点难，再琢磨一下… | 内容较复杂，仍在处理…      | Still processing…                                  |
| `aiLab.interview.prep.session`  | 正在建面试间…           | 正在准备模拟面试…          | Preparing the mock interview…                      |
| `aiLab.attach.parsed`           | 读完了，草稿在右边      | 解析完成，草稿已显示在右侧 | Parsing complete. The draft is shown on the right. |

### 9.5 确认弹窗

| key                                     | 现（中）                                                                                    | 改（中）                                                                                      | 改（英）                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aiLab.closeConfirm.description`        | 当前这次生成会被停止，已经产出的内容保留在对话里，下次打开还能接着聊                        | 当前生成将停止，已生成的内容会保留在对话中，下次打开可继续                                    | The current generation will stop. Generated content stays in the conversation, and you can continue next time.                                                                                            |
| `settings.jobProfile.deleteConfirmBody` | 删掉之后，AI 会退回通用建议——它不再知道你的目标岗位和当前卡点，答案不保留，要重新走一遍引导 | 删除后，AI 将仅提供通用建议，不再参考目标岗位与求职难点；已填写的答案不会保留，需重新完成引导 | After deletion, AI will give only general suggestions and will no longer consider your target role or job search blockers. Your answers will not be kept, and you will need to complete onboarding again. |
| `account.security.totp.codesWarning`    | 请立即保存这些备用码，它们只显示这一次——手机丢失时，这是你唯一的登录方式                    | 请立即保存备用码，备用码仅显示一次；手机丢失时，这是唯一的登录方式                            | Save these backup codes now. They are shown only once and are the only way to sign in if you lose your phone.                                                                                             |

### 9.6 设置与说明

| key                                        | 现（中）                                                                                                                       | 改（中）                                                                       | 改（英）                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.cloudSync.description`           | 换台电脑也能接着改，数据保存在云端，随时可以下载回本地                                                                         | 在多台设备间同步简历，数据存储于云端，可随时下载至本地                         | Sync resumes across devices. Data is stored in the cloud and can be downloaded at any time.                                                                   |
| `settings.memory.description`              | 这里是 AI 记住的关于你的事，记错了随时可以删掉                                                                                 | AI 记录的个人背景与偏好，可随时删除有误的条目                                  | Background and preferences recorded by AI. Delete incorrect entries at any time.                                                                              |
| `settings.memory.fadedHint`                | 很久没被用到了，之后会越来越少影响回答                                                                                         | 长期未使用，对回答的影响将逐渐降低                                             | Unused for a long time. Its influence on responses will gradually decrease.                                                                                   |
| `settings.jobProfile.revisePlaceholder`    | 说一句话改它，比如「我不去杭州了」                                                                                             | 用一句话描述修改内容，例如「目标城市改为上海」                                 | Describe the change in one sentence, e.g. "Change target city to Shanghai"                                                                                    |
| `auth.terms.updatedHint`                   | 我们更新了服务条款与隐私政策，继续使用前请再确认一次                                                                           | 服务条款与隐私政策已更新，请确认后继续使用                                     | Our Terms of Service and Privacy Policy have been updated. Please review and confirm to continue.                                                             |
| `account.invite.emptyHint`                 | 把海报或链接发给正在找工作的朋友——你们都会多一份 AI 额度，他也少走点弯路                                                       | 将海报或链接分享给正在求职的朋友，双方均可获得额外 AI 额度                     | Share the poster or link with a friend who is job hunting. You both receive extra AI credits.                                                                 |
| `aiLab.interview.comingSoon`               | 语音模拟面试还在打磨中，它会用你的简历和目标岗位出题、边听边追问，做完给你一份可复盘的纪要——现在还差最后一段路，先不上假的给你 | 语音模拟面试正在开发中，将根据简历与目标岗位出题并实时追问，结束后生成复盘纪要 | Voice mock interviews are in development. They will ask questions based on your resume and target role, follow up in real time, and produce a review summary. |
| `aiLab.assets.use`                         | 拿它优化简历                                                                                                                   | 用于优化简历                                                                   | Use to improve resume                                                                                                                                         |
| `store.notifications.syncConflictResolved` | 检测到其它设备的修改：已备份为历史版本，当前内容已覆盖云端                                                                     | 检测到其他设备的修改，已备份为历史版本，当前内容已同步至云端                   | Changes from another device were detected and saved as a version. Your current content has been synced to the cloud.                                          |

### 9.7 AI 对话与评语

| key                                            | 现（中）                                                               | 改（中）                                   | 改（英）                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `aiLab.greeting.title`                         | 嗨，今天想把简历打磨成什么样？                                         | 今天需要优化简历的哪些内容？               | What would you like to improve in your resume today?                         |
| `aiLab.chat.interruptExpired`                  | 这张卡片来自一场已经结束的对话，我接不上了，重新说一次，我们从这里继续 | 此卡片所属的对话已结束，请重新发送需求     | This card belongs to a conversation that has ended. Send your request again. |
| `aiLab.artifact.verdictFallback.outstanding_0` | 这份简历不太需要我，投出去就好                                         | 简历完成度高，可直接投递                   | This resume is highly complete and ready to send.                            |
| `aiLab.artifact.verdictFallback.strong_1`      | 拿得出手了，再抠一遍数字会更狠                                         | 已达到投递水平，进一步量化成果可提升说服力 | Ready to send. Further quantifying results would make it more persuasive.    |
| `aiLab.artifact.verdictFallback.solid_0`       | 该有的都有，就是还差几个能站住的数字                                   | 内容完整，但缺少可验证的量化数据           | The content is complete but lacks verifiable quantified results.             |
| `aiLab.artifact.verdictFallback.draft_1`       | 起点在这里，不在别处，挑一段你最熟的经历把过程和结果补全               | 建议从最熟悉的一段经历入手，补全过程与结果 | Start with the role you know best and fill in the process and results.       |
| `aiLab.interview.report.band.ready`            | 可以上场了                                                             | 准备充分                                   | Ready                                                                        |
| `aiLab.interview.report.verdict.ready`         | 准备得不错，可以去真面了                                               | 准备充分，可以参加正式面试                 | Well prepared for a real interview                                           |
| `aiLab.interview.report.verdict.developing`    | 基本盘有了，答法还要练                                                 | 基础扎实，回答技巧仍需练习                 | The fundamentals are solid; answering technique needs more practice          |
| `aiLab.interview.report.verdict.early`         | 这是第一步——下面几条改完，下次会很不一样                               | 处于起步阶段，建议按以下几点逐项改进       | Early stage. Work through the suggestions below one by one                   |
| `onboarding.done.title`                        | 记下了                                                                 | 已保存                                     | Saved                                                                        |
| `onboarding.done.subtitle`                     | 我这就把你的画像写出来，进去就能用                                     | 正在生成求职画像，稍后即可使用             | Generating your job profile. It will be ready shortly.                       |

### 9.8 用户口吻（例外类）

| 位置                                              | 现（中）                                                                            | 改（中）                                                                            | 改（英）                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding.fields.blocker.options.failInterview` | 面试挂了                                                                            | 面试未通过                                                                          | Not passing interviews                                                                                                                              |
| `onboarding.fields.blocker.options.noReply`       | 投了没回音                                                                          | 投递后无回复                                                                        | No responses to applications                                                                                                                        |
| `onboarding.fields.blocker.options.whereToApply`  | 不知道投哪                                                                          | 不确定投递方向                                                                      | Unsure where to apply                                                                                                                               |
| `aiLab.artifact.match.useKeywordPrompt`           | 我确实有「{{keyword}}」相关的经历，帮我把它自然地补进简历——没有的话直接告诉我，别编 | 我有「{{keyword}}」相关的经历，请将其补充到简历中；如缺少依据，请直接说明，不要编造 | I have experience related to "{{keyword}}". Please add it to my resume. If there is no basis for it, say so directly rather than inventing details. |
| `WelcomeSuggestions.tsx`（硬编码）                | 给简历做一次竞争力体检                                                              | 对简历做一次竞争力分析                                                              | —                                                                                                                                                   |

### 9.9 Landing

| key                             | 现（中）                                                                                                         | 改（中）                                                                                                      | 改（英）                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `landing.export.items.1.desc`   | 登录后保存到账号，换台设备接着改                                                                                 | 登录后保存至账号，可在任意设备继续编辑                                                                        | Sign in to save to your account and continue editing on any device.                                                                                                                                                      |
| `landing.features.items.1.desc` | AI 的每处改动都带理由，采纳还是跳过你说了算                                                                      | AI 的每处修改均附有理由，由你决定采纳或放弃                                                                   | Every AI edit comes with a reason. You decide whether to accept or discard it.                                                                                                                                           |
| `landing.process.steps.0.title` | 给它一个岗位                                                                                                     | 设定目标岗位                                                                                                  | Set a target role                                                                                                                                                                                                        |
| `landing.process.steps.0.desc`  | 贴 JD，或者只说公司和岗位名——没有 JD 它自己去搜真实招聘；语言、时长、难度问清了才开面试间                        | 粘贴职位描述，或仅提供公司与岗位名称；未提供职位描述时，AI 将检索真实招聘信息；确认语言、时长与难度后开始面试 | Paste a job description, or provide only the company and role. Without a job description, AI searches for the real posting. The interview starts once language, length, and difficulty are confirmed.                    |
| `landing.cases.items.1.title`   | 换个方向，重新组织表达                                                                                           | 转换职业方向，重新组织经历表述                                                                                | Reframe your experience for a new direction                                                                                                                                                                              |
| `team.subtitle`                 | 一个开源项目，下面这些人一起把它写了出来                                                                         | Magic Resume 是开源项目，以下为项目贡献者                                                                     | Magic Resume is open source. These are its contributors.                                                                                                                                                                 |
| `faq.items.0.a`                 | 需要；简历、修改记录和求职画像都保存在你的账号里，换台设备登录就能接着改，注册只要一步，用邮箱或第三方账号都可以 | 需要；简历、修改记录与求职画像均保存在账号中，在任意设备登录后可继续编辑；支持使用邮箱或第三方账号一步注册    | Yes. Your resumes, revision history, and job profile are stored in your account, so you can continue editing on any device after signing in. You can sign up in one step with an email address or a third-party account. |

## 10. 配套改动草案

以下文本已于 2026-09-27 落地。

**`.impeccable.md` → Brand Personality 段替换为：**

> 专业、克制、可信。像素小蓝宠只作为视觉形象保留（方眼睛、天线星、跳动的动效），不进入文案：界面与 AI 对话都使用书面、准确的表达，不用语气词、不拟人。
> 语气：先说事实，再给操作；UI 微文案简短、动词开头；AI 对话可以完整说明理由，但不注水、不复述用户已见的内容。完整规范见 `docs/specs/ui-copy-professional/spec.md`。
> 情绪目标：让用户有掌控感与信任感——面对的是可靠的专业工具，而不是被填表、也不是被 AI 牵着走。

**`CLAUDE.md` → Design Context 的 Personality 行替换为：**

> - **Personality**: 专业、克制、可信。像素小蓝宠只保留为视觉形象,不进文案;界面与 AI 对话都用书面、准确的表达,不用语气词、不拟人。UI 微文案简短、动词开头;AI 对话可完整说明理由,但不注水、不复述用户已见。完整规范见 `docs/specs/ui-copy-professional/spec.md`。

**`docs/reviews/2026-09-26-ui-copy-audit.md` 顶部加注：**

> **2026-09-27**：本文的语气建议（口语化改写，如「这次没成，再试一次」）已被 `docs/specs/ui-copy-professional/spec.md` 取代；术语统一、标点、事实错误、硬编码穿帮等结论仍然有效。

## 11. 执行与验收

**批次**（按用户撞见的概率排序）：

1. `errors` / `agentErrors` / `auth` / `common` / `export` / `store` / `tools`
2. `settings` / `account` / `billing` / `pricing` / `feedback` / `sharedPage` / `notificationsPage`
3. `aiLab`（609 条，按子节拆分）
4. `modals` / `editPage` / `onboarding` / `knowledge` 及其余 namespace
5. Landing `zh.json` / `en.json`
6. 组件内硬编码中文：原位改语气，不抽成 i18n key，保持 `i18n-cjk-baseline.json` 的计数不变

**验收**：

1. key 集合与每条字符串的占位符集合（`{{…}}`、`<n>`）改写前后一致，差异为 0
2. 口语残留扫描。每处剩余命中都要进白名单并写明理由：
   - 中文：`[呀啦吧呢哦嘛嗨]|没成|没能|挂了|一下|就行|接着|喊我|搞定|再试一次|其它`
   - 英文：`Oops|Hmm|\bjust\b|!|n't\b|'re\b|'ll\b`
3. 按钮、标签、tab 类 key：新文本超过原文 1.3 倍的，逐条人工确认不溢出
4. `pnpm --filter @magic-resume/web i18n:check`、`pnpm --filter @magic-resume/web test`、Landing 的 `astro check` 与 `build` 全部通过
5. 中英文各目检一遍：Landing、Dashboard、编辑器 AI 实验室（对话、分析卡、面试报告）、设置、账户与计费、错误页与 404

## 12. 决定与实施结果

**已确认的决定**

1. 「体检」统一为「简历分析」：现有文案里「分析」出现 41 次、「诊断」0 次，沿用「分析」不引入新词。
2. 英文统一为 sentence case，不用缩写；所有格（today's）不受影响。
3. 像素小蓝宠只保留视觉形象，从文案中去掉人设。

**实施结果（2026-09-27）**

| 范围                           |        改动条数 |
| ------------------------------ | --------------: |
| Web 中文 `zh/translation.json` |             572 |
| Web 英文 `en/translation.json` |             658 |
| Landing 中文 `zh.json`         |             126 |
| Landing 英文 `en.json`         |             101 |
| 组件硬编码中文                 | 42 处，9 个文件 |

- key 集合与占位符集合改写前后一致；唯一新增的 key 是 `aiLab.interview.voiceError.connection_limit`（代码与测试早已引用、JSON 一直缺失，此前界面回落到通用的「语音连接已中断」）。
- `modals.aiModal.*`（285 条）在源码中已无引用，属于死 key，本次未改写，建议单独清理。
- Landing 首屏标题改为「读取，提议，由你决定」而非「AI 读取，AI 提议…」：后者在 390px 宽度下折成两行；第一行「AI Native 的简历工作台」已给出主语。
- 残留扫描的白名单：`just now`（刚刚）、`not just`（不仅）、「了解」、改写前的反例文本（如 `workflow.stream.items.1.before`）、用户口吻的指令与示例引语。

**不在本次范围**

- Core 侧模型生成的语气：`Magic-Resume-Core` 的 `analyze-resume.tool.ts` 在分数 ≥ 60 时允许「a light, warm touch」（`VERDICT_LEVITY_FLOOR`）。前端 fallback 已是专业语气，但模型实时生成的评语仍可能带俏皮，需要在 Core 另开改动统一。
