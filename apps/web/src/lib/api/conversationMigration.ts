import { dbClient } from './IndexDBClient';
import { conversationApi } from './conversationApi';
import {
  AI_SESSION_STORAGE_PREFIX,
  conversationTitle,
  type AiSessionSnapshot,
} from '@/store/useAiSessionStore';

/**
 * 把本地已有的对话搬上云，一次性。
 *
 * 上云前 IndexedDB 是**唯一副本**：只靠「下次打开那份简历时顺手投递」会把用户再也不打开
 * 的那些对话永远留在本地，而他们换台设备就再也看不到了。所以这里主动扫一遍。
 *
 * 两条硬规则：
 * 1. **迁移成功也不删本地。** 留一个版本周期的后悔药——删早了，出问题就没得救。
 * 2. **失败不标记完成。** 下次启动重来；导入接口幂等，重跑不会写重。
 */

const DONE_KEY = 'magic-conversation-migrated';

export async function migrateLocalConversations(): Promise<{
  imported: number;
  skipped: number;
} | null> {
  if (typeof window === 'undefined') return null;
  if (await dbClient.getItem<boolean>(DONE_KEY)) return null;

  const keys = (await dbClient.getAllKeys()).filter((k) =>
    k.startsWith(AI_SESSION_STORAGE_PREFIX),
  );
  let imported = 0;
  let skipped = 0;
  let failed = false;

  for (const key of keys) {
    const session = await dbClient.getItem<AiSessionSnapshot>(key);
    // 空会话不值得在历史里占一行。
    if (!session?.sessionId || !session.messages?.length) {
      skipped += 1;
      continue;
    }
    const resumeId = key.slice(AI_SESSION_STORAGE_PREFIX.length);
    try {
      await conversationApi.import(session.sessionId, {
        resumeId,
        title: conversationTitle(session.messages),
        messages: session.messages.map((message, seq) => {
          const { role, content, ...rest } = message;
          return {
            seq,
            role,
            content,
            payload: rest as Record<string, unknown>,
          };
        }),
      });
      imported += 1;
    } catch {
      // 网络不通或未登录。**就地停住**，不再把剩下的挨个试一遍——它们发往同一个
      // 服务端，只会把同一个错误重复 N 遍刷满控制台。不标记完成，下次启动重来。
      failed = true;
      break;
    }
  }

  if (!failed) await dbClient.setItem(DONE_KEY, true);
  return { imported, skipped };
}
