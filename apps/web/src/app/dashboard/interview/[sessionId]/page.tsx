'use client';

import React, { use } from 'react';
import InterviewRoom from '../_components/InterviewRoom';

/**
 * 一场模拟面试。
 *
 * 路由段是会话 id；还没开始时是字面量 `new`——那时会话还不存在（`mode` 是 `start` 的入参，
 * 提前建会话就等于替用户把语音/打字这个选择做了）。选定模式后 `router.replace` 换成真正的
 * id，从那一刻起刷新能续上。
 */
export default function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <InterviewRoom sessionId={sessionId} />;
}
