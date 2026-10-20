'use client';

import React, { use } from 'react';
import InterviewRoom from '../_components/InterviewRoom';

/** 新面试先配置 Voice Agent；已有会话按 URL 恢复，不重复创建或更改已保存的配置。 */
export default function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <InterviewRoom sessionId={sessionId} />;
}
