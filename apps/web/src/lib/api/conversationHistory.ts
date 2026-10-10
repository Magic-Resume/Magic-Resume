import type { ChatMessage } from '@/app/dashboard/edit/_components/ai/types';
import type { ConversationDetail } from './conversationApi';

/** Keep the server's message keys when a legacy history has gaps in its sequence. */
export function restoreConversationMessages(messages: ConversationDetail['messages']): ChatMessage[] {
  const hasRecovered = messages.some(m => typeof m.payload?.historyAt === 'string');
  const ordered = hasRecovered ? [...messages].sort((a, b) => {
    const time = (m: typeof a) => {
      const recovered = typeof m.payload?.historyAt === 'string' ? Date.parse(m.payload.historyAt) : NaN;
      return Number.isFinite(recovered) ? recovered : Date.parse(m.createdAt);
    };
    return time(a) - time(b) || a.seq - b.seq;
  }) : messages;
  return ordered.map(m => ({
    ...(m.payload ?? {}),
    id: typeof m.payload?.id === 'string' ? m.payload.id : `history-message-${m.seq}`,
    role: m.role,
    content: m.content ?? undefined,
    conversationSeq: m.seq,
  } as ChatMessage));
}
