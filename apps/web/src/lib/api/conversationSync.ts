import { dbClient } from './IndexDBClient';
import { conversationApi } from './conversationApi';

/**
 * 对话的写队列。
 *
 * 服务端是真相，但**离线必须照常可用**——上云不该把「断网也能接着聊」弄丢。所以写入是：
 * 本地立即生效 → 入队 → 尽力上传，失败留队、下次联网或下次启动补传。
 *
 * 幂等由服务端的 `(conversationId, seq)` 唯一约束保证：重投同一条拿到 `duplicate`，
 * 与 `stored` 一样出队。**这条约束是整套同步的承重墙**，没有它就得在客户端做去重，
 * 而客户端根本不知道别的设备写了什么。
 */

const QUEUE_KEY = 'magic-conversation-outbox';

interface QueuedMessage {
  conversationId: string;
  resumeId?: string;
  /** 建会话时用一次（`ensure` 不覆盖已有标题），所以每条都带着也只会生效第一次。 */
  title?: string;
  seq: number;
  role: string;
  content?: string;
  payload?: Record<string, unknown>;
  /** 入队时间，仅用于排障与清理超期项。 */
  at: number;
}

/** 超过这个天数还没送出去的，多半是那台设备再也不会联网了，丢掉免得无限堆积。 */
const MAX_AGE_MS = 7 * 86_400_000;

let flushing: Promise<void> | null = null;

async function readQueue(): Promise<QueuedMessage[]> {
  const saved = await dbClient.getItem<QueuedMessage[]>(QUEUE_KEY);
  if (!Array.isArray(saved)) return [];
  const cutoff = Date.now() - MAX_AGE_MS;
  return saved.filter((m) => m.at >= cutoff);
}

async function writeQueue(items: QueuedMessage[]): Promise<void> {
  await dbClient.setItem(QUEUE_KEY, items);
}

/**
 * 记一条待上传的消息，然后尽力送出。
 *
 * **不 await 上传**：调用方是渲染路径，网络慢不该让消息迟迟不出现在界面上。
 */
export async function enqueueMessage(
  message: Omit<QueuedMessage, 'at'>,
): Promise<void> {
  const queue = await readQueue();
  // 同一个 (conversationId, seq) 已在队里就**替换掉它**，不是跳过。消息本身会变
  // （审批被批准、todo 打勾），跳过等于让离线期间的旧版本赢过新版本。
  const at = Date.now();
  const index = queue.findIndex(
    (m) => m.conversationId === message.conversationId && m.seq === message.seq,
  );
  if (index >= 0) queue[index] = { ...message, at };
  else queue.push({ ...message, at });
  await writeQueue(queue);
  void flush();
}

/** 退避的起点与上限。上限取 5 分钟：再久用户已经换了一次上下文，补传的意义不大。 */
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 5 * 60_000;

let backoffMs = 0;
let nextAttemptAt = 0;

/**
 * 把队列送出去。
 *
 * 同一时刻只跑一个，避免多个触发点（入队、联网、启动）并发把同一条投三遍。
 *
 * **一失败就停这一轮。** 队列里的每一条都发往同一个服务端，第一条失败意味着后面的
 * 也会失败——继续试只是把同一个错误重复 N 遍。上线时踩过：路由没配好，一条 8 消息的
 * 对话在控制台刷出 17 个 404。加上退避，失败后也不会每个触发点都重来一轮。
 */
export async function flush(): Promise<void> {
  if (flushing) return flushing;
  if (Date.now() < nextAttemptAt) return;
  flushing = (async () => {
    try {
      const queue = await readQueue();
      if (queue.length === 0) return;
      const ensured = new Set<string>();

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          // 会话可能还没在服务端建出来（离线时开的新对话）。ensure 是 upsert，
          // 每个会话在本轮只做一次。
          if (!ensured.has(item.conversationId)) {
            await conversationApi.ensure(item.conversationId, {
              resumeId: item.resumeId,
              title: item.title,
            });
            ensured.add(item.conversationId);
          }
          // `replaced` 与 `stored` 一样出队——它是重投的正常结果，不是失败。
          await conversationApi.appendMessage(item.conversationId, item);
        } catch {
          // 这一条连同它后面的全部留在队里，下次再试。**不按错误类型丢弃**——
          // 判断"哪种失败是永久的"判断错了就是静默丢消息，而退避已经解决了泛滥。
          backoffMs = Math.min(
            backoffMs ? backoffMs * 2 : BACKOFF_MIN_MS,
            BACKOFF_MAX_MS,
          );
          nextAttemptAt = Date.now() + backoffMs;
          await writeQueue(queue.slice(i));
          return;
        }
      }
      backoffMs = 0;
      nextAttemptAt = 0;
      await writeQueue([]);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/**
 * 联网时补传。
 *
 * 挂 `online` 而不是轮询：轮询在离线时白烧电，而 `online` 正是我们要等的那个事件。
 */
export function startConversationSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onOnline = () => {
    // 网络状态变了是新信息，退避该清零——否则刚连上还要再干等最多 5 分钟。
    backoffMs = 0;
    nextAttemptAt = 0;
    void flush();
  };
  window.addEventListener('online', onOnline);
  // 启动时补一次：上次会话可能是在断网中被关掉的。
  void flush();
  return () => window.removeEventListener('online', onOnline);
}
