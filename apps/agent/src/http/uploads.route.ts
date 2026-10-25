import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Settings } from '../config.js';
import { AttachmentStore, attachmentKey } from '../attachments/store.js';
import { AgentError } from '../contracts/errors.js';
import {
  MAX_MULTIPART_BYTES,
  readAttachmentMultipart,
} from '../document/input.js';
import { requestLifetime } from './lifetime.js';

export function uploadsRoutes(
  app: FastifyInstance,
  settings: Settings,
  store: AttachmentStore,
) {
  app.register(async (uploads) => {
    uploads.addContentTypeParser(
      'multipart/form-data',
      (_request, payload, done) => done(null, payload),
    );
    uploads.post('/api/uploads/attachment', async (request, reply) => {
      const lifetime = requestLifetime(request, reply, settings.runTimeoutMs);
      try {
        const type = request.headers['content-type'] ?? '';
        if (!type.toLowerCase().startsWith('multipart/form-data'))
          throw new AgentError(
            415,
            'invalid_input',
            'attachment_request_invalid',
          );
        if (Number(request.headers['content-length']) > MAX_MULTIPART_BYTES)
          throw new AgentError(413, 'invalid_input', 'attachment_too_large');
        const file = await readAttachmentMultipart(
          request.body as Readable,
          type,
          lifetime.signal,
        );
        return {
          data: await store.save(
            file,
            file.filename ?? 'attachment',
            lifetime.signal,
          ),
        };
      } catch (error) {
        reply.header('Connection', 'close');
        throw error;
      } finally {
        lifetime.close();
      }
    });
  });
  app.post('/api/uploads/attachment/read-url', async (request) => {
    const parsed = z
      .object({ key: attachmentKey })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      throw new AgentError(400, 'invalid_input', 'attachment_key_invalid');
    return {
      data: await store.readUrl(
        parsed.data.key,
        `${request.protocol}://${request.host}`,
      ),
    };
  });
  app.get('/api/uploads/attachment/:key', async (request, reply) => {
    const lifetime = requestLifetime(request, reply, settings.runTimeoutMs);
    try {
      const key = store.localKey(
        `${request.protocol}://${request.host}${request.raw.url}`,
      );
      const { meta, file } = await store.read(key!, lifetime.signal);
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
        )
        .type(meta.contentType)
        .send(file.bytes);
    } finally {
      lifetime.close();
    }
  });
}
