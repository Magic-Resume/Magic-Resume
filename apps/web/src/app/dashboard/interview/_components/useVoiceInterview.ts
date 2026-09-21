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
import { startLocalVad, type LocalVadHandle } from './localVad';
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
  /**
   * 上游 `usage_update` 报的单场剩余秒数（实测上限 7200）。**这不是我们的额度**——
   * 我们自己那份按周分钟数还没上线；这一条只说明「上游什么时候会掐」。
   */
  upstreamSessionSecondsLeft: number | null;
  /**
   * 上游报的**账号**剩余音频秒数。它是容量而不是时长：所有用这个 ChatGPT 账号的面试
   * 共用这一个池子，所以它是 admin 容量面唯一的真实数据源。
   */
  upstreamAudioSecondsLeft: number | null;
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
  upstreamSessionSecondsLeft: null,
  upstreamAudioSecondsLeft: null,
};

/**
 * 等 `session_bootstrap` 的上限。实测正常情况下它在一秒内就到。
 * 给到 8 秒是让慢网络有余量，同时别让候选人对着哑巴干等太久。
 */
const BOOTSTRAP_TIMEOUT_MS = 8_000;

/** 最多因为坏账号重连几次。服务端的连接窗口只允许 3 条，留一条给真正的断线重连。 */
const MAX_DEGRADED_RETRIES = 2;

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
   * gpt-voice 那条链路没有房间、也没有 agent 参与者，只有一条浏览器直连 ChatGPT
   * 网页语音的 PeerConnection。它和 LiveKit 的 Room 互斥，同一时刻只有一个非空。
   */
  const gptRef = useRef<{
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
    stream: MediaStream | null;
    audio: HTMLAudioElement | null;
    /** 这条连接的租约凭据；续租与归还都认它。 */
    connectionId: string;
    /** 归还时要用，而 teardown 拿不到闭包里的 sessionId。 */
    sessionId: string;
    heartbeat: ReturnType<typeof setInterval> | null;
    /**
     * 「连上了但上游从没 bootstrap」的看门狗。
     *
     * 上游对它不认的 session 字段**不报错，只是永远不下发 `session_bootstrap`**，
     * HTTP 照回 201——服务端签发 answer 时看不出来，只有这里等得到超时。
     * 表现是「面试接通了但面试官一直不说话」。
     */
    bootstrapTimer: ReturnType<typeof setTimeout> | null;
    vad: LocalVadHandle | null;
  } | null>(null);
  /** 上游最近一次报的账号剩余音频秒数，随心跳捎回服务端。 */
  const audioLeftRef = useRef<number | null>(null);
  /** 看门狗要重连，而 `connect` 在它下面才声明——用 ref 绕开顺序。 */
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  /** 这一场已经因为「接通但不说话」重连过几次。服务端的窗口只允许 3 条连接。 */
  const degradedRetriesRef = useRef(0);
  /**
   * gpt-voice 的转写中间态。上游是「先 add 骨架、再按路径 patch 追加」，所以要按消息
   * 序号索引。放 ref 不放 state：它只是解析过程，界面要的是解析结果。
   */
  const gptMessagesRef = useRef<
    Map<
      number,
      {
        role: 'interviewer' | 'candidate';
        parts: string[];
        settled: boolean;
        /**
         * 这条消息的分片到达节奏。用来回答一个只能实测的问题：**上游到底是边说边发
         * 转写，还是说完一次性发**。前者客户端能做流式，后者做不了——我们根本拿不到
         * 中途的文字。日志一行一条消息，只在开发期打。
         */
        timing: { first: number; deltas: number; lastAt: number };
      }
    >
  >(new Map());

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

    // gpt-voice 那条链路：关通道、关连接、停麦克风、摘掉播放元素。
    const gpt = gptRef.current;
    gptRef.current = null;
    if (gpt) {
      try {
        gpt.dc?.close();
      } catch {
        /* 已经关了 */
      }
      try {
        gpt.pc.close();
      } catch {
        /* 已经关了 */
      }
      gpt.vad?.destroy();
      if (gpt.heartbeat) clearInterval(gpt.heartbeat);
      if (gpt.bootstrapTimer) clearTimeout(gpt.bootstrapTimer);
      gpt.stream?.getTracks().forEach((track) => track.stop());
      if (gpt.audio) gpt.audio.srcObject = null;
      // 主动归还，别占着租约等它自己过期。失败无所谓——服务端到期会回收。
      void interviewApi
        .gptVoiceRelease(gpt.sessionId, gpt.connectionId)
        .catch(() => undefined);
    }
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    setState(INITIAL_STATE);
  }, [teardown]);


  /** 候选人开口时把面试官压到这个音量——压成 0 会让人以为断了。 */
  const DUCKED_VOLUME = 0.15;

  /** 去重用的规范化：标点与空白不算内容差异，全角半角同样不算。 */
  const normalizeTurnText = (text: string) =>
    text
      .replace(/[\s，,。.、；;：:！!？?""''（）()【】[\]—\-~·]/g, '')
      .toLowerCase();

  const gptTextOf = (m: { parts: string[] }) => m.parts.join('').trim();

  /**
   * 上游眼里的「用户消息」。这是我们唯一能往那条对话里写字的通道——它的 session schema
   * 没有 instructions 字段，所以面试官人格和候选人打的字都只能从这里进去。
   *
   * **`author.role` 必须是 `user`，别想着换成 `system` 去当全局提示词。** 实测四种取值
   * 各用一条全新连接：`user` 正常存活，`system` / `assistant` / `developer` 一律被上游
   * 回一个 `goodbye` 并当场关闭会话。真上了的表现是「每次面试接通瞬间掉线」，而 SDP
   * 交换那一步还是 201 成功——属于最难查的一类。
   *
   * 另一条实测：这样发进去的消息**不会触发模型回应**，它只是给对话铺上下文。真正触发
   * 一轮的是候选人的音频；所以 primer 的作用是「让下一轮带着面试官身份」，不是「让它现在开口」。
   */
  const relayMessage = (text: string) =>
    JSON.stringify({
      type: 'data_message',
      data: JSON.stringify({
        type: 'relay_message',
        payload: {
          type: 'relay_message',
          message: {
            id: crypto.randomUUID(),
            author: { role: 'user' },
            create_time: Date.now() / 1000,
            content: { content_type: 'text', parts: [text] },
            metadata: { serialization_metadata: { custom_symbol_offsets: [] } },
            clientMetadata: { isOptimistic: true },
          },
        },
      }),
    });

  /**
   * 已经灌出去的 primer。
   *
   * 它以「用户消息」身份进对话，上游会把它当成候选人说的话回显成转写——不挡住，整段
   * 面试官 prompt 就会进面试记录和评分报告。
   */
  const primerRef = useRef('');

  /** 定稿的那一轮并入对话并回传后端；中途态只更新实时回显。 */
  const settleGptTurn = useCallback(
    (seq: number) => {
      const m = gptMessagesRef.current.get(seq);
      if (!m) return;
      const text = gptTextOf(m);
      if (!text) return;
      // primer 不是候选人说的话。比前缀而不是全等：上游回显时可能截断。
      const primer = primerRef.current;
      if (primer && text.startsWith(primer.slice(0, 60))) return;
      const role = m.role;
      setState((s) => {
        const turns = [...s.turns];
        /*
         * 开场白由 HTTP `start` 先落一次，上游再念一遍又送回来——不去重就会重复。
         *
         * 比对要**规范化后再比**，而且**不能只看紧邻的上一条**：服务端那句是 LLM 文本
         * （全角标点），上游那句是 ASR 转写（半角），而两者之间往往还隔着候选人的
         * 「你好」和一段即兴寒暄。原来「紧邻 + 全等」两个条件都不成立，于是同一句
         * 开场白在逐字稿里出现了两遍。
         */
        const key = normalizeTurnText(text);
        const at = turns.findIndex(
          (turn) =>
            turn.role === role && normalizeTurnText(turn.text) === key,
        );
        if (at >= 0) turns[at] = { role, text };
        else turns.push({ role, text });
        return {
          ...s,
          turns,
          liveTranscript: role === 'candidate' ? '' : s.liveTranscript,
          liveReply: role === 'interviewer' ? '' : s.liveReply,
        };
      });
      if (!sessionId) return;
      void interviewApi
        .recordGptVoiceTranscript(sessionId, {
          // 上游的消息序号在一条连接内稳定，配上连接 id 就是全局稳定的幂等键。
          transcript_id: `${gptRef.current?.connectionId ?? 'unknown'}:${seq}`,
          role: role === 'candidate' ? 'user' : 'assistant',
          text,
        })
        .catch((error) => {
          // 回传失败不影响面试继续，只是这一轮不会进报告。
          console.warn('[interview voice] transcript report failed', error);
        });
    },
    [sessionId],
  );

  /**
   * 解 DataChannel 的下行事件。
   *
   * 信封是 `{ type: 'data_message', data: '<json>' }`，内层才是真事件。转写走
   * `chat_message_delta`，JSON Patch 风格：先 add 出骨架（这里能拿到角色与方向），
   * 之后按 `/message/content/parts/0/text` 追加。
   */
  const handleGptEvent = useCallback(
    (raw: string) => {
      let outer: unknown;
      try {
        outer = JSON.parse(raw);
      } catch {
        return;
      }
      if (!outer || typeof outer !== 'object') return;
      const envelope = outer as { type?: string; data?: unknown };
      let inner: unknown = envelope;
      if (envelope.type === 'data_message' && typeof envelope.data === 'string') {
        try {
          inner = JSON.parse(envelope.data);
        } catch {
          return;
        }
      }
      const message = inner as { type?: string; payload?: unknown };
      const payload = (message.payload ?? message) as Record<string, unknown>;

      if (message.type === 'state_update') {
        const next = String(payload.new_state ?? '');
        if (next === 'speaking' || next === 'responding') {
          setState((s) => ({ ...s, phase: 'speaking' }));
        } else if (next === 'listening' || next === 'idle') {
          setState((s) => ({ ...s, phase: 'listening' }));
        }
        return;
      }

      /*
       * 上游的额度与指令。**此前整条事件被忽略**——上游让挂断我们听不见。
       *
       * 实测 payload：
       *   { audio_s, session_s, rate_limit_message,
       *     instructions: { hang_up, disable_video, reconnect },
       *     limits: { audio: { remaining_seconds }, session: { remaining_seconds } } }
       *
       * `limits.audio` 是**这个 ChatGPT 账号**的剩余音频秒数（实测约 7200 秒一个周期），
       * `limits.session` 是单场上限（7200 秒）。前者是容量、后者是时长，两回事。
       */
      // 上游真的起来了——解除「接通但不说话」的看门狗。
      if (message.type === 'session_bootstrap') {
        const gpt = gptRef.current;
        if (gpt?.bootstrapTimer) {
          clearTimeout(gpt.bootstrapTimer);
          gpt.bootstrapTimer = null;
        }
        return;
      }

      if (message.type === 'usage_update') {
        const limits = (payload.limits ?? {}) as Record<
          string,
          { remaining_seconds?: unknown } | null
        >;
        const instructions = (payload.instructions ?? {}) as {
          hang_up?: unknown;
        };
        const seconds = (key: string) => {
          const value = limits[key]?.remaining_seconds;
          return typeof value === 'number' ? value : null;
        };
        const session = seconds('session');
        const audio = seconds('audio');
        const note = payload.rate_limit_message;
        if (typeof note === 'string' && note) {
          console.warn('[interview voice] upstream rate limit:', note);
        }
        // 上游说该挂了就挂——不听也会被它掐，区别只是我们来不及出报告。
        const hangUp = instructions.hang_up === true;
        if (hangUp) console.warn('[interview voice] upstream asked to hang up');
        if (audio !== null) audioLeftRef.current = audio;
        setState((s) => ({
          ...s,
          upstreamSessionSecondsLeft: session ?? s.upstreamSessionSecondsLeft,
          upstreamAudioSecondsLeft: audio ?? s.upstreamAudioSecondsLeft,
          // `finished` 会被房间接住：断连、出报告，走的是正常收尾那条路。
          phase: hangUp ? 'finished' : s.phase,
        }));
        return;
      }

      if (message.type !== 'chat_message_delta') return;
      const delta = payload.delta as Record<string, unknown> | undefined;
      if (!delta) return;

      /*
       * 骨架靠 `v.message` 认，**不能靠 `typeof v === 'object'`**：数组也是 object，
       * 于是一批补丁 `{ c, v: [ …ops ] }` 会走进这条分支、找不到 message 就整批丢掉。
       * 表现是文字不流式、说完才一次性出现——下面那行 `Array.isArray` 永远够不到。
       */
      const skeleton =
        delta.v && typeof delta.v === 'object' && !Array.isArray(delta.v)
          ? (delta.v as { message?: Record<string, unknown> })
          : undefined;
      if (typeof delta.c === 'number' && skeleton?.message) {
        const msg = skeleton.message;
        const content = (msg.content ?? {}) as { parts?: unknown[] };
        const head = (content.parts?.[0] ?? {}) as {
          direction?: string;
          text?: string;
        };
        const role: 'interviewer' | 'candidate' =
          head.direction === 'in' ? 'candidate' : 'interviewer';
        const parts = [String(head.text ?? '')];
        const now = performance.now();
        gptMessagesRef.current.set(delta.c, {
          role,
          parts,
          settled: false,
          timing: { first: now, deltas: 0, lastAt: now },
        });
        if (parts[0]) {
          setState((s) =>
            role === 'candidate'
              ? { ...s, liveTranscript: parts[0] }
              : { ...s, liveReply: parts[0] },
          );
        }
        return;
      }

      // 一批补丁走 `v` 数组，单条补丁 delta 自己就是那条 op。
      const ops = Array.isArray(delta.v)
        ? (delta.v as Record<string, unknown>[])
        : delta.p !== undefined
          ? [delta]
          : [];
      if (ops.length === 0) return;
      const seq = Math.max(...gptMessagesRef.current.keys(), -1);
      const current = seq >= 0 ? gptMessagesRef.current.get(seq) : undefined;
      if (!current) return;

      for (const op of ops) {
        const path = String(op.p ?? '');
        if (op.o === 'replace' && path === '/message/status') {
          if (op.v === 'finished_successfully' && !current.settled) {
            current.settled = true;
            const { first, deltas, lastAt } = current.timing;
            // 跨度接近 0 = 上游是说完一次性发的，客户端做不了流式。
            console.debug(
              `[interview voice] msg#${seq} ${current.role} ${deltas} 个分片，` +
                `跨度 ${Math.round(lastAt - first)}ms，` +
                `定稿距首片 ${Math.round(performance.now() - first)}ms`,
            );
            settleGptTurn(seq);
          }
          continue;
        }
        const match = path.match(/^\/message\/content\/parts\/(\d+)\/text$/);
        if (!match) continue;
        const index = Number(match[1]);
        current.timing.deltas += 1;
        current.timing.lastAt = performance.now();
        current.parts[index] = (current.parts[index] ?? '') + String(op.v ?? '');
        const text = gptTextOf(current);
        setState((s) =>
          current.role === 'candidate'
            ? { ...s, liveTranscript: text }
            : { ...s, liveReply: text },
        );
      }
    },
    [settleGptTurn],
  );

  /**
   * gpt-voice 的建连：浏览器直连 ChatGPT 网页语音，没有房间、也没有 agent 参与者。
   * 面试由上游模型自己主持，我们只做三件事——递 SDP、翻字幕、回传定稿。
   */
  const connectGptVoice = useCallback(
    async (superseded: () => boolean) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
      });
      const audio = new Audio();
      audio.autoplay = true;
      const session = {
        pc,
        dc: null as RTCDataChannel | null,
        stream: null as MediaStream | null,
        audio,
        // 每次建连一个新 id：重连是一条新连接，复用旧 id 等于声称自己还是上一条。
        connectionId: crypto.randomUUID(),
        sessionId: sessionId ?? '',
        heartbeat: null as ReturnType<typeof setInterval> | null,
        bootstrapTimer: null as ReturnType<typeof setTimeout> | null,
        vad: null as LocalVadHandle | null,
      };
      gptRef.current = session;

      const dc = pc.createDataChannel('oai-events', { negotiated: true, id: 0 });
      session.dc = dc;
      dc.onmessage = (event) => handleGptEvent(String(event.data));

      pc.ontrack = (event) => {
        if (superseded()) return;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        audio.srcObject = stream;
        void audio.play().catch(() => {
          console.warn('[interview voice] gpt-voice autoplay blocked');
        });
        const context = audioRef.current;
        // 传**和上面 `audio.srcObject` 同一个** stream 实例，不是 track：
        // 另包一条流会让 Chrome 不往 WebAudio 推数据，球就不动了。
        if (context) {
          metersRef.current.output?.close();
          metersRef.current.output = createLevelMeter(context, stream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (superseded()) return;
        if (pc.connectionState === 'failed') {
          setState((s) => ({
            ...s,
            phase: 'error',
            error: '语音连接中断',
            errorCode: 'connection',
          }));
        } else if (pc.connectionState === 'disconnected') {
          setState((s) =>
            s.phase === 'finished' || s.phase === 'error'
              ? s
              : { ...s, phase: 'connecting' },
          );
        }
      };

      /*
       * 麦克风单独一个 try。**拿不到也不能把连接拆掉**——上游照样出声，输入框常驻，
       * 用户改用打字就能把这场面试走完。
       */
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (superseded()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        session.stream = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const context = audioRef.current;
        const micTrack = stream.getAudioTracks()[0];
        if (context && micTrack) {
          metersRef.current.input = createLevelMeter(context, micTrack);
        }

        /*
         * 端侧 VAD **不等它**：16MB 的运行时要下载和编译，而面试不能为此推迟开场。
         * 加载好了就接上，没加载好或者失败了，这一场就退回"上游说了算"——
         * 那正是现在的行为，所以降级是无感的。
         */
        if (context) {
          void startLocalVad({
            stream,
            audioContext: context,
            onSpeechStart: () => {
              // 候选人开口，立刻把面试官压下去并切回聆听态——不等上游那个跨境往返。
              const current = gptRef.current;
              if (current?.audio) current.audio.volume = DUCKED_VOLUME;
              setState((s) =>
                s.phase === 'speaking' ? { ...s, phase: 'listening' } : s,
              );
            },
            onSpeechEnd: () => {
              const current = gptRef.current;
              if (current?.audio) current.audio.volume = 1;
            },
          }).then((handle) => {
            if (!handle) return;
            // 这一场可能在模型加载完之前就结束了，那就直接扔掉。
            if (gptRef.current !== session || superseded()) handle.destroy();
            else session.vad = handle;
          });
        }
      } catch (micError) {
        console.warn('[interview voice] microphone unavailable', micError);
        setState((s) => ({ ...s, micDenied: true }));
      }

      /*
       * 没拿到麦克风也必须有 audio m-line —— 上游会直接回
       * `Offer did not have an audio media section.`。
       * `createOffer({ offerToReceiveAudio })` 是废弃选项，新版 Chrome 不再据此补
       * m-line，所以这里显式建一个只收的 transceiver。
       */
      if (!pc.getTransceivers().some((t) => t.receiver.track?.kind === 'audio')) {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // 上游是 ICE-lite：等本地候选收齐再一次性提交，不做 trickle。
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const timer = setTimeout(resolve, 2500);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timer);
            resolve();
          }
        };
      });
      if (superseded()) return;

      if (!sessionId) throw new Error('missing session id');
      // 空 offer 发出去必然被服务端 DTO 挡成 400，而那个错说不清是这里出的问题。
      const offerSdp = pc.localDescription?.sdp ?? '';
      if (!offerSdp) throw new Error('local SDP offer is empty');
      const { answer_sdp, primer, heartbeat_interval_seconds } =
        await interviewApi.gptVoiceSession(
          sessionId,
          offerSdp,
          session.connectionId,
        );
      if (superseded()) return;

      /*
       * 续租间隔**由服务端给**，不在这里写死——租约时长改了，客户端不跟着改就会
       * 在面试中途被回收，而那种掉线看起来像网络问题。
       */
      const everyMs = Math.max(5, heartbeat_interval_seconds) * 1000;
      session.heartbeat = setInterval(() => {
        void interviewApi
          .gptVoiceHeartbeat(
            sessionId,
            session.connectionId,
            audioLeftRef.current,
          )
          .then((beat) => {
            // 服务端掐不断已经接通的通话，只能请我们自己收尾——走正常的结束流程
            // 进复盘，而不是弹一个错误屏。
            if (beat.should_stop) {
              console.warn('[interview voice] budget exhausted, wrapping up');
              setState((s) => ({ ...s, phase: 'finished' }));
            }
          })
          .catch((error) => {
            console.warn('[interview voice] heartbeat failed', error);
          });
      }, everyMs);
      await pc.setRemoteDescription({ type: 'answer', sdp: answer_sdp });

      /*
       * 把上游从通用语音助手掰成这一场的面试官。**必须等 DataChannel 真的开了**——
       * SDP 换完不代表通道可写，早发一步这条消息会被静默丢掉，而丢掉的表现就是
       * 「上游又变回通用助手」，从现象上根本看不出是时序问题。
       */
      if (primer) {
        primerRef.current = primer;
        const prime = () => {
          try {
            dc.send(relayMessage(primer));
          } catch (error) {
            console.warn('[interview voice] primer injection failed', error);
          }
        };
        if (dc.readyState === 'open') prime();
        else dc.onopen = prime;
      }

      /*
       * 装看门狗：DataChannel 开了之后上游该在几秒内下发 `session_bootstrap`。
       * 到点没来就是那个坏账号——报给服务端标记掉，换一条连接重来。
       * 不这么做的话，分到坏账号的面试全都表现为「接通了没人说话」，而且无迹可寻。
       */
      session.bootstrapTimer = setTimeout(() => {
        session.bootstrapTimer = null;
        if (gptRef.current !== session) return;
        console.warn('[interview voice] upstream never bootstrapped');
        void interviewApi
          .gptVoiceDegraded(sessionId, session.connectionId)
          .then((result) => {
            if (!result.retryable) return;
            if (degradedRetriesRef.current >= MAX_DEGRADED_RETRIES) return;
            degradedRetriesRef.current += 1;
            teardown();
            void connectRef.current?.();
          })
          .catch((error) => {
            console.warn('[interview voice] degraded report failed', error);
          });
      }, BOOTSTRAP_TIMEOUT_MS);

      connectingRef.current = false;
      setState((s) => ({ ...s, phase: 'listening' }));
    },
    [handleGptEvent, sessionId, teardown],
  );

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
      const creds = await interviewApi.voiceToken(sessionId);
      if (superseded()) return;

      /*
       * 后端按会话配置决定走哪条链路：默认 LiveKit；在 `config.transport` 里点名
       * 过的会话走 gpt-voice。后者的媒体直连 ChatGPT 网页语音，服务端不签发凭据，
       * 所以到这一步就分叉，不能再往下走 LiveKit 的建连。
       */
      if (creds.transport === 'gpt-voice') {
        const context = new AudioContext();
        if (context.state === 'suspended') await context.resume();
        if (superseded()) {
          void context.close();
          return;
        }
        audioRef.current = context;
        await connectGptVoice(superseded);
        return;
      }

      const { url, token } = creds;
      if (!url || !token) {
        throw new Error('voice credentials missing url/token');
      }

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
  }, [connectGptVoice, sessionId, teardown]);

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
    /*
     * gpt-voice 这条链路没有 LiveKit 的文本流，走的是 DataChannel 的 `relay_message`：
     * 它以上游眼里的「用户消息」身份进入对话，模型会把它当对话内容来遵循。
     */
    const gpt = gptRef.current;
    if (gpt) {
      if (!gpt.dc || gpt.dc.readyState !== 'open') return false;
      try {
        gpt.dc.send(relayMessage(text));
        return true;
      } catch (error) {
        console.warn('[interview voice] gpt-voice sendText failed', error);
        return false;
      }
    }

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
    // gpt-voice 没有 participant，直接开关本地音轨。
    const gpt = gptRef.current;
    if (gpt) {
      const track = gpt.stream?.getAudioTracks()[0];
      if (!track) return;
      const next = !track.enabled;
      track.enabled = next;
      setState((s) => ({ ...s, muted: !next }));
      return;
    }

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

  // 看门狗回调要重连，而它装在 connect 之前——这里把最新的实现递给它。
  connectRef.current = connect;

  useEffect(() => teardown, [teardown]);

  return { state, connect, disconnect, readLevels, sendText, toggleMute };
}
