'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client';
import { interviewApi, type InterviewStage } from '@/lib/api/interviewApi';
import {
  createLevelMeter,
  type LevelMeter,
  type VoiceLevels,
} from './audioLevels';

/**
 * agents 监听用户文本输入的 topic（`@livekit/agents` 的 `TOPIC_CHAT`）。
 * 常量在服务端包里，前端不引它，所以这里写死——**改了两边要一起改**。
 */
const CHAT_TOPIC = 'lk.chat';

export type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'finished'
  | 'error';

export interface VoiceTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  /**
   * LiveKit 的 `lk.segment_id`。同一段话的多次更新共用它——**认领用的是它，不是
   * 数组下标**，所以补发的定稿会替换那一轮而不是追加一轮。历史消息没有这个字段。
   */
  segmentId?: string;
}

export interface VoiceInterviewState {
  phase: VoicePhase;
  /** 候选人正在说的那句，实时更新；定稿后并入 `turns`。 */
  liveTranscript: string;
  /** 面试官正在说的那句，同样实时更新、定稿后并入 `turns`。 */
  liveReply: string;
  turns: VoiceTurn[];
  stage: InterviewStage;
  error: string | null;
  errorCode: 'connection' | 'mic_denied' | null;
  /**
   * 拿不到麦克风。**这不是错误状态**——房间照常连着，面试官照常出声，
   * 只是这一场你得用打字回答。输入框本来就常驻，所以它只是少了一种输入方式。
   */
  micDenied: boolean;
  /** 你自己把麦克风静音了（与 `micDenied` 分开：一个是选择，一个是拿不到）。 */
  muted: boolean;
}

const INITIAL_STATE: VoiceInterviewState = {
  phase: 'idle',
  liveTranscript: '',
  liveReply: '',
  turns: [],
  stage: 'introduction',
  error: null,
  errorCode: null,
  micDenied: false,
  muted: false,
};

/**
 * 语音面试的客户端。
 *
 * 这里曾经是一整套手写管线：裸 WebSocket、`AudioWorklet` 采集与重采样、PCM 播放队列、
 * 打断时清队列、回声判定……那些**现在全在 LiveKit 里**，而且做得更好。手写那份踩过的
 * 每一个坑——面试官被自己的回声掐断、权限弹窗把统计循环卡死、断线之后不会重连——
 * 都是在重新发明它早就解决的东西。
 *
 * 剩给我们的只有两件：**建连**，和**把 agent 的状态翻成界面语言**。
 */
export function useVoiceInterview(sessionId: string | null) {
  const [state, setState] = useState<VoiceInterviewState>(INITIAL_STATE);
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const metersRef = useRef<{ input?: LevelMeter; output?: LevelMeter }>({});

  /**
   * 两路电平，**由调用方在自己的 rAF 里按需读取**。
   *
   * 刻意不进 React state：这是 60fps 的连续量，走 state 就是每秒 60 次重渲染，而且当初为了
   * 压住重渲染加的 0.04 阈值会把运动量化成台阶。球本来就有自己的渲染循环，直接来取即可。
   */
  const readLevels = useCallback((): VoiceLevels => {
    const { input, output } = metersRef.current;
    return {
      input: input?.read() ?? 0,
      output: output?.read() ?? 0,
    };
  }, []);

  const teardown = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    connectingRef.current = false;
    metersRef.current.input?.close();
    metersRef.current.output?.close();
    metersRef.current = {};
    void audioRef.current?.close();
    audioRef.current = null;
    void room?.disconnect();
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    setState(INITIAL_STATE);
  }, [teardown]);

  const connect = useCallback(async () => {
    if (!sessionId || connectingRef.current) return;
    connectingRef.current = true;
    setState((s) => ({
      ...s,
      phase: 'connecting',
      error: null,
      errorCode: null,
    }));

    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    /**
     * 建连中途我们是不是已经被拆掉了。
     *
     * `roomRef` 在第一个 `await` **之前**就被赋值，而 teardown 会在 await 期间把它置空
     * （dev 的 StrictMode 双跑 effect 必然触发一次）。不认领回来的话，等 `room.connect()`
     * 落地时就出现一个**已经连上、却没人持有句柄**的房间：离开时 `room?.disconnect()`
     * 空转，LiveKit 那边照常按 agent 分钟计费，直到房间空置超时。
     */
    const superseded = () => roomRef.current !== room;

    // agent 的状态由 LiveKit 以参与者属性广播（listening / thinking / speaking），
    // 不用我们再定义一套事件协议——手写那版的 `VoiceServerEvent` 就是在做这件事。
    room.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      const agentState = changed['lk.agent.state'];
      if (!agentState || !participant.isAgent) return;
      setState((s) => ({
        ...s,
        phase:
          agentState === 'thinking'
            ? 'thinking'
            : agentState === 'speaking'
              ? 'speaking'
              : 'listening',
      }));
    });

    /*
     * 字幕。
     *
     * **两边的流语义不一样**，混为一谈就会出错：
     *
     * | | 流形态 | 什么时候算说完 |
     * |---|---|---|
     * | 你（ASR） | 非 delta：每次更新新开一条流、写当前完整文本、立刻关 | 最后一条带 `final: true` |
     * | 面试官（TTS） | delta：一条流从头写到尾 | **流关闭**——属性恒为 `final: false` |
     *
     * 把「流关闭」一律当成一轮，就会得到「面试官，您好，我」「面试官，您好，我叫」……
     * 一句话被拆成十几轮（你截图里那样）。反过来只认 `final: true`，面试官那一路
     * 因为属性永远是 false，一轮都进不来。
     *
     * `lk.segment_id` 同一段共用，用来**替换**而不是追加。
     */
    room.registerTextStreamHandler('lk.transcription', async (reader, info) => {
      const fromAgent = info.identity !== room.localParticipant.identity;
      // 属性挂在流自己的 info 上，不是 handler 第二个参数（那个只有 identity）。
      const attrs = reader.info.attributes ?? {};
      const isFinal = attrs['lk.transcription_final'] === 'true';
      const segmentId = attrs['lk.segment_id'];

      let text = '';
      for await (const chunk of reader) {
        text += chunk;
        // 逐字回显。面试官那一路是**跟着语音播放**推的，字与声音同步。
        setState((s) =>
          fromAgent ? { ...s, liveReply: text } : { ...s, liveTranscript: text },
        );
      }

      const finalText = text.trim();
      if (!finalText) return;

      // 面试官那一路是 delta 流：一条流即一整句，关闭就是说完了。
      const settled = isFinal || fromAgent;
      if (!settled) {
        // 你这边还没定稿：只更新实时那一份，不进对话。
        setState((s) => ({ ...s, liveTranscript: finalText }));
        return;
      }

      setState((s) => {
        const role = fromAgent ? ('interviewer' as const) : ('candidate' as const);
        const turns = [...s.turns];
        const last = turns[turns.length - 1];

        // 同一段的定稿可能来第二次（打断后补发），用 segmentId 认领并替换而不是追加。
        const sameSegment =
          segmentId !== undefined && last?.segmentId === segmentId;
        // 开场白由 HTTP `start` 先落进 turns，紧接着 agent 又把它念一遍、
        // 转写再送回来——不去重就会一模一样出现两次。
        const duplicate = last?.role === role && last.text === finalText;

        if (sameSegment || duplicate) {
          turns[turns.length - 1] = { role, text: finalText, segmentId };
        } else {
          turns.push({ role, text: finalText, segmentId });
        }

        return {
          ...s,
          liveTranscript: fromAgent ? s.liveTranscript : '',
          liveReply: fromAgent ? '' : s.liveReply,
          turns,
        };
      });
    });

    // 面试官的声音：订阅到就挂上播放。SDK 自己管排期与打断时的丢弃。
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      // ⚠️ attach() 不能删。Chrome 下远端 WebRTC 轨要挂在 <audio> 元素上才会出声，
      // 下面的音量计只是旁路取数（analyser 不接 destination），不负责播放。
      track.attach();
      const context = audioRef.current;
      if (context && track.mediaStreamTrack) {
        metersRef.current.output?.close();
        metersRef.current.output = createLevelMeter(
          context,
          track.mediaStreamTrack,
        );
      }
    });

    room.on(RoomEvent.Disconnected, () =>
      setState((s) =>
        s.phase === 'finished' || s.phase === 'error'
          ? s
          : { ...s, phase: 'idle' },
      ),
    );
    // 断线重连由 SDK 做——这正是手写那版完全没有的能力。
    room.on(RoomEvent.ConnectionStateChanged, (cs) => {
      if (cs === ConnectionState.Reconnecting) {
        setState((s) => ({ ...s, phase: 'connecting' }));
      }
    });

    try {
      const { url, token } = await interviewApi.voiceToken(sessionId);
      if (superseded()) return;

      // connect() 由用户点击触发，所以这里建 AudioContext 一定在手势里；
      // 少数浏览器仍会给出 suspended 状态，resume 一下。
      const context = new AudioContext();
      if (context.state === 'suspended') await context.resume();
      if (superseded()) {
        void context.close();
        return;
      }
      audioRef.current = context;

      await room.connect(url, token);
      // 连上之后才是真正要紧的一次检查：走到这里房间已经在计费了，没人持有就得自己挂掉。
      if (superseded()) {
        void room.disconnect();
        return;
      }

      /*
       * 麦克风单独一个 try。**拿不到麦克风绝不能把房间一起拆掉**——房间还在，
       * 面试官就还能出声，而输入框常驻，用户改用打字就能把这场面试进行完。
       * 以前这一步和建连共用一个 catch，权限被拒直接走 teardown()：能听的那半边
       * 也一起没了，用户面对的是一句「语音连接断了」和一个死掉的页面。
       */
      try {
        const publication =
          await room.localParticipant.setMicrophoneEnabled(true);
        if (superseded()) {
          void room.disconnect();
          return;
        }
        const micTrack = publication?.track?.mediaStreamTrack;
        if (micTrack) {
          metersRef.current.input = createLevelMeter(context, micTrack);
        }
      } catch (micError) {
        if (superseded()) {
          void room.disconnect();
          return;
        }
        console.warn('[interview voice] microphone unavailable', micError);
        setState((s) => ({ ...s, micDenied: true }));
      }

      connectingRef.current = false;
      setState((s) => ({ ...s, phase: 'listening' }));
    } catch (error) {
      if (superseded()) return;
      const message = error instanceof Error ? error.message : String(error);
      teardown();
      setState((s) => ({
        ...s,
        phase: 'error',
        error: message,
        // 麦克风权限是唯一一个用户自己能修的，值得单独一句提示。
        errorCode: /notallowed|permission|denied/i.test(message)
          ? 'mic_denied'
          : 'connection',
      }));
    }
  }, [sessionId, teardown]);

  /**
   * 把打的字当作一次发言送给面试官。
   *
   * 走 LiveKit 的 `lk.chat` 文本流——**agents 原生就监听这个 topic**（`textEnabled`
   * 默认开），默认回调是 `interrupt()` + `generateReply({ userInput })`。所以打字和说话
   * 汇进的是同一条链路：同样进会话历史、同样出声、球同样进「在说」态。
   *
   * 返回 false = 房间不在，调用方要退回 HTTP 那条（回复只出字，不出声）。
   */
  const sendText = useCallback(async (text: string): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return false;
    try {
      await room.localParticipant.sendText(text, { topic: CHAT_TOPIC });
      return true;
    } catch (error) {
      console.warn('[interview voice] sendText failed', error);
      return false;
    }
  }, []);

  /** 自己静音。拿不到麦克风时（`micDenied`）没有可切的东西。 */
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setState((s) => ({ ...s, muted: !next }));
    } catch (error) {
      console.warn('[interview voice] mute toggle failed', error);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  return { state, connect, disconnect, readLevels, sendText, toggleMute };
}
