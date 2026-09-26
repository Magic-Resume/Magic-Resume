import { DisconnectReason } from 'livekit-client';

/**
 * 语音建连失败后该怎么收场。
 *
 * 后端的准入拒绝（Core `voiceAdmissionDenial`）不全是故障：本场时间已经用完是**正常结束**，
 * 该走收尾进复盘；只有真连不上、拿不到麦克风、额度用完、重连次数用完才是要告诉用户的状态。
 */

/** 后端 409 的二级码。只用来分派，不渲染给用户。 */
export const VOICE_ADMISSION_SUBCODE = {
  WINDOW_CLOSED: 'interview_window_closed',
  CONNECTION_LIMIT: 'interview_connection_limit',
} as const;

export type VoiceErrorCode =
  | 'connection'
  | 'mic_denied'
  | 'quota'
  | 'connection_limit';

export type VoiceFailureOutcome =
  | { kind: 'finished' }
  | { kind: 'error'; errorCode: VoiceErrorCode };

interface ThrownWithAppError {
  appError?: { errorCode?: string; subCode?: string; httpStatus?: number };
}

export function classifyVoiceFailure(error: unknown): VoiceFailureOutcome {
  const appError = (error as ThrownWithAppError | null)?.appError;
  const message = error instanceof Error ? error.message : String(error);
  // 窗口到点后重连被拒：时间用完了，不是故障。
  if (appError?.subCode === VOICE_ADMISSION_SUBCODE.WINDOW_CLOSED) {
    return { kind: 'finished' };
  }
  if (
    appError?.errorCode === 'quota_exceeded' ||
    appError?.httpStatus === 402
  ) {
    return { kind: 'error', errorCode: 'quota' };
  }
  if (appError?.subCode === VOICE_ADMISSION_SUBCODE.CONNECTION_LIMIT) {
    return { kind: 'error', errorCode: 'connection_limit' };
  }
  return {
    kind: 'error',
    errorCode: /notallowed|permission|denied/i.test(message)
      ? 'mic_denied'
      : 'connection',
  };
}

/**
 * 房间断开之后进什么状态。
 *
 * 服务端到点会删房（worker 调 `deleteRoom`，Core ADR-0029 §6）：那是这一场结束了，
 * 必须走 `finished` 进复盘。落回 `idle` 的话页面会自动重连，签票被 409 挡下，用户看到的是一张错误卡。
 */
export function phaseAfterDisconnect(
  reason: DisconnectReason | undefined,
): 'finished' | 'idle' {
  return reason === DisconnectReason.ROOM_DELETED ? 'finished' : 'idle';
}
