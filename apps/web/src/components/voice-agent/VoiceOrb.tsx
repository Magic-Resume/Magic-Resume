'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { fragmentShader, vertexShader } from './orb-shader';
import type { AudioLevel, OrbAppearance, VoiceStatus } from './types';

export interface VoiceOrbProps {
  appearance?: OrbAppearance;
  status?: VoiceStatus;
  muted?: boolean;
  /** Animation multiplier. Zero renders a still frame. */
  speed?: number;
  size?: number;
  fallbackSrc?: string;
  audioLevel?: AudioLevel;
}
const energyFor: Record<VoiceStatus, number> = {
  idle: 0.15,
  connecting: 0.4,
  listening: 0.5,
  thinking: 0.35,
  speaking: 1,
  ended: 0.1,
};

export function VoiceOrb({
  appearance = 'halo',
  status = 'idle',
  muted = false,
  speed = 1,
  size,
  audioLevel = 0,
  fallbackSrc = '/images/interview-orb-fallback.png',
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const settings = useRef({ status, muted, speed, audioLevel });
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    settings.current = { status, muted, speed, audioLevel };
  }, [status, muted, speed, audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setAvailable(false);
      return;
    }
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let dispose = () => {};
    const release = () => {
      dispose();
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
    try {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error('Shader compilation failed');
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error('Program allocation failed');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Program linking failed');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('Buffer allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const timeUniform = gl.getUniformLocation(program, 'u_time');
      const audioUniform = gl.getUniformLocation(program, 'u_audio');
      const resolutionUniform = gl.getUniformLocation(program, 'u_resolution');
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let frame = 0,
        elapsed = 0,
        lastTime = 0,
        energy = 0.15;
      let amplitude = 0,
        velocity = 0;
      let visible = true,
        lost = false;
      const draw = (now: number) => {
        frame = 0;
        if (lost || !visible || document.hidden) return;
        const {
          status: current,
          muted: silent,
          speed: rate,
          audioLevel: input,
        } = settings.current;
        const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 0;
        lastTime = now;
        const raw =
          typeof input === 'function'
            ? input()
            : typeof input === 'number'
              ? input
              : input.current;
        const target =
          silent && current !== 'speaking'
            ? 0
            : Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
        // 细分时间步，掉帧后也保持语音弹簧稳定。
        const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
        for (let i = 0; i < steps; i++) {
          const dt = delta / steps;
          velocity += ((target - amplitude) * 180 - velocity * 24) * dt;
          amplitude += velocity * dt;
        }
        energy += ((silent ? 0.05 : energyFor[current]) - energy) * 0.035;
        if (!motion.matches)
          elapsed +=
            delta *
            Math.max(0, rate) *
            (0.82 + energy * 0.12 + amplitude * 0.2);
        const response = motion.matches ? 0 : amplitude;
        if (orbRef.current)
          orbRef.current.style.transform = `translate3d(0,${-response * 2}px,0) scale(${1 + response * 0.04},${1 - response * 0.018})`;
        gl.uniform1f(timeUniform, elapsed);
        gl.uniform1f(audioUniform, response);
        gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (!motion.matches) frame = requestAnimationFrame(draw);
      };
      const resume = () => {
        cancelAnimationFrame(frame);
        lastTime = 0;
        frame = requestAnimationFrame(draw);
      };
      const resize = () => {
        const resolution = Math.min(window.devicePixelRatio || 1, 2);
        // 宿主以 transform 缩放舞台；后备像素按布局尺寸计算，避免入场缩放把清晰度锁在低分辨率。
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * resolution));
        canvas.height = Math.max(
          1,
          Math.round(canvas.clientHeight * resolution),
        );
        gl.viewport(0, 0, canvas.width, canvas.height);
        resume();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        resume();
      });
      intersection.observe(canvas);
      const onLost = (event: Event) => {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frame);
        if (orbRef.current) orbRef.current.style.transform = 'none';
        setAvailable(false);
      };
      canvas.addEventListener('webglcontextlost', onLost);
      document.addEventListener('visibilitychange', resume);
      motion.addEventListener('change', resume);
      dispose = () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersection.disconnect();
        canvas.removeEventListener('webglcontextlost', onLost);
        document.removeEventListener('visibilitychange', resume);
        motion.removeEventListener('change', resume);
      };
      resize();
    } catch {
      release();
      setAvailable(false);
      return;
    }
    return release;
  }, []);

  const style =
    size === undefined
      ? undefined
      : ({ '--voice-orb-size': `${size}px` } as CSSProperties);
  return (
    <div
      ref={orbRef}
      className="voice-orb"
      data-appearance={appearance}
      data-status={status}
      data-muted={muted}
      style={style}
      aria-hidden="true"
    >
      <div className="voice-orb__halo" />
      <div className="voice-orb__body">
        <canvas
          ref={canvasRef}
          className="voice-orb__canvas"
          hidden={!available}
        />
        {/* 静态本地图片只用于图形上下文不可用时的即时降级。 */}
        {!available && (
          // eslint-disable-next-line @next/next/no-img-element -- 本地静态降级图须在图形上下文失败时立即显示。
          <img className="voice-orb__fallback" src={fallbackSrc} alt="" />
        )}
      </div>
      <div className="voice-orb__rim" />
    </div>
  );
}
