import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatRequest, ApprovalRequest } from '../contracts/requests.js';
import type { AgentEvent } from '../contracts/events.js';
import { modelError } from '../model/errors.js';
import type { RunEngine } from '../engine/run.js';
import { failureEvents } from '../engine/event-mapper.js';
import { openEventStream } from '../sse.js';

export async function streamRun(
  engine: RunEngine,
  body: ChatRequest | ApprovalRequest,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const disconnected = new AbortController();
  const lifetime = new AbortController();
  const timer = setTimeout(
    () =>
      lifetime.abort(
        new DOMException('Run time limit reached', 'TimeoutError'),
      ),
    engine.settings.runTimeoutMs,
  );
  timer.unref();
  const signal = AbortSignal.any([disconnected.signal, lifetime.signal]);
  const onDisconnect = () => {
    if (!reply.raw.writableFinished) disconnected.abort();
  };
  request.raw.once('aborted', onDisconnect);
  reply.raw.once('close', onDisconnect);
  let prepared: Awaited<ReturnType<RunEngine['prepare']>> | undefined;
  let stream: ReturnType<NonNullable<typeof prepared>['stream']> | undefined;
  let send: ReturnType<typeof openEventStream> | undefined;
  let gateTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    prepared = await engine.prepare(body, signal);
    stream = prepared.stream();
    const buffered: AgentEvent[] = [];
    const open = async () => {
      if (send) return;
      signal.throwIfAborted();
      reply.hijack();
      send = openEventStream(reply.raw, prepared!.runId, disconnected.signal);
      await send(prepared!.startedEvent);
      for (const event of buffered) await send(event);
      buffered.length = 0;
      clearTimeout(gateTimer);
    };
    const timeout = Symbol('first-event-timeout');
    const gate = new Promise<typeof timeout>((resolve) => {
      gateTimer = setTimeout(
        () => resolve(timeout),
        engine.settings.firstEventWaitMs,
      );
      gateTimer.unref();
    });
    let pending = stream.next();
    while (true) {
      const next = send ? await pending : await Promise.race([pending, gate]);
      if (next === timeout) {
        await open();
        continue;
      }
      if (next.done) {
        await open();
        break;
      }
      if (next.value.modelOutput) await open();
      if (next.value.event) {
        if (send) await send(next.value.event);
        else buffered.push(next.value.event);
      }
      pending = stream.next();
    }
  } catch (error) {
    if (!disconnected.signal.aborted) {
      if (!send) {
        const failure = modelError(error, signal);
        reply.code(failure.status).send(failure.payload);
      } else {
        for (const event of failureEvents(error, signal))
          await send(event).catch(() => {});
      }
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(gateTimer);
    disconnected.abort();
    try {
      await stream?.return(undefined);
    } finally {
      await prepared?.close();
    }
    request.raw.removeListener('aborted', onDisconnect);
    reply.raw.removeListener('close', onDisconnect);
    if (send && !reply.raw.destroyed) reply.raw.end();
  }
}
