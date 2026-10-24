'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 浏览器原生语音听写（Web Speech API）。
 *
 * 不做后端 STT：那要新开接口、配服务商 key、进计费体系，工作量远大于输入框本身。
 * 代价是浏览器覆盖不齐——Chrome / Edge 中文识别可用，Safari 部分支持，Firefox 基本
 * 没有。所以这里**探测不到就返回 supported: false**，由调用方直接不渲染麦克风：
 * 一个点了没反应的假按钮比没有按钮更糟。
 *
 * 同理，权限被拒之后本次会话不再重试——反复弹系统权限框是骚扰。
 */

// lib.dom 里没有 SpeechRecognition（它仍是 draft），只声明用到的那部分。
type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative; length: number };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechErrorKind = 'denied' | 'network' | 'unknown';

export function useSpeechInput({
  lang,
  onFinalText,
  onError,
}: {
  /** 跟随 UI 语言：zh-CN / en-US。 */
  lang: string;
  /** 一段话落定：把它接到输入框已有内容后面。 */
  onFinalText: (text: string) => void;
  onError?: (kind: SpeechErrorKind) => void;
}) {
  // 探测放进 state 而不是直接调用：SSR 期间 window 不存在，首帧必须先当作不支持，
  // 挂载后再修正——否则 hydration 两边的按钮数量对不上。
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // 用户是否仍想继续听。Chrome 的 continuous 在静默一段后仍会 end，
  // 这个标记让我们区分「说完了自然结束」与「用户点了停」。
  const wantRef = useRef(false);
  const deniedRef = useRef(false);
  const onFinalRef = useRef(onFinalText);
  const onErrorRef = useRef(onError);
  onFinalRef.current = onFinalText;
  onErrorRef.current = onError;

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    setInterim('');
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || deniedRef.current) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) onFinalRef.current(text);
        else pending += text;
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return; // 静默收场
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        deniedRef.current = true; // 本次会话不再重试
        wantRef.current = false;
        setSupported(false);
        onErrorRef.current?.('denied');
        return;
      }
      wantRef.current = false;
      onErrorRef.current?.(event.error === 'network' ? 'network' : 'unknown');
    };

    recognition.onend = () => {
      setInterim('');
      // 说话间隙导致的自然结束：用户没点停就接着听。
      if (wantRef.current && !deniedRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // 已经在跑 / 被浏览器拒绝重启,落到停止态即可。
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    wantRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantRef.current = false;
      setListening(false);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // 卸载时收干净,否则麦克风指示灯会一直亮着。
  useEffect(
    () => () => {
      wantRef.current = false;
      recognitionRef.current?.abort();
    },
    []
  );

  return { supported, listening, interim, start, stop, toggle };
}
