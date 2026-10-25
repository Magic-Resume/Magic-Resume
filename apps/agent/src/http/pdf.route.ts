import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { Settings } from '../config.js';
import { AgentError } from '../contracts/errors.js';
import {
  downloadDocument,
  readImportMultipart,
  parseImportFields,
  MAX_MULTIPART_BYTES,
  type DocumentFile,
} from '../document/input.js';
import { parseResumeDocument } from '../engine/parse-resume.js';
import { failureEvents } from '../engine/event-mapper.js';
import { createDirectModel } from '../model/direct.js';
import { modelError } from '../model/errors.js';
import type { ModelResolver } from '../model/transport.js';
import { openEventStream } from '../sse.js';
import { requestLifetime } from './lifetime.js';

export function pdfRoute(
  app: FastifyInstance,
  settings: Settings,
  resolver?: ModelResolver,
) {
  app.register(async (imports) => {
    imports.addContentTypeParser(
      'multipart/form-data',
      (_request, payload, done) => done(null, payload),
    );
    imports.post(
      '/api/pdf/parse',
      { bodyLimit: Math.min(settings.bodyLimitBytes, 65_536) },
      async (request, reply) => {
        const lifetime = requestLifetime(request, reply, settings.runTimeoutMs);
        let model: Awaited<ReturnType<typeof createDirectModel>> | undefined;
        let send: ReturnType<typeof openEventStream> | undefined;
        try {
          let body: unknown = request.body;
          let file: DocumentFile | undefined;
          if (
            request.headers['content-type']
              ?.toLowerCase()
              .startsWith('multipart/form-data')
          ) {
            const declared = Number(request.headers['content-length']);
            if (declared > MAX_MULTIPART_BYTES)
              throw new AgentError(413, 'invalid_input', 'document_too_large');
            const multipart = await readImportMultipart(
              request.body as Readable,
              request.headers['content-type'],
              lifetime.signal,
            );
            file = multipart.file;
            body = multipart;
          }
          const { config, sourceUrl } = parseImportFields(body);
          if (!file && !sourceUrl)
            throw new AgentError(
              400,
              'invalid_input',
              'import_request_invalid',
            );
          model = await createDirectModel(
            config,
            settings,
            lifetime.signal,
            resolver,
          );
          file ??= await downloadDocument(
            sourceUrl!,
            settings,
            lifetime.signal,
            resolver,
          );
          lifetime.signal.throwIfAborted();
          reply.hijack();
          send = openEventStream(
            reply.raw,
            randomUUID(),
            lifetime.disconnectedSignal,
          );
          await send({ type: 'run_started' });
          const resume = await parseResumeDocument(
            file,
            model,
            settings,
            lifetime.signal,
            send,
          );
          await send({
            type: 'resume_update',
            payload: {
              resume,
              final: true,
              mutation: {
                kind: 'snapshot',
                authoritative: true,
                final: true,
                resume,
              },
            },
          });
          await send({ type: 'done' });
        } catch (error) {
          if (!reply.raw.destroyed) {
            if (send) {
              for (const event of failureEvents(error, lifetime.signal))
                await send(event).catch(() => {});
            } else {
              const failure = modelError(error, lifetime.signal);
              reply
                .header('Connection', 'close')
                .code(failure.status)
                .send(failure.payload);
            }
          }
        } finally {
          lifetime.close();
          await model?.close();
          if (send && !reply.raw.destroyed) reply.raw.end();
        }
      },
    );
  });
}
