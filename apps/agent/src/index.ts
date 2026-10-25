import { readSettings } from './config.js';
import { buildServer } from './server.js';

// The process handles request-scoped credentials; inherited diagnostic settings
// must never enable transcript or provider-error capture.
for (const variable of [
  'LANGSMITH_TRACING',
  'LANGCHAIN_TRACING_V2',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_VERBOSE',
])
  delete process.env[variable];

const settings = readSettings();
const app = buildServer({ settings, logger: true });

for (const name of ['SIGINT', 'SIGTERM'] as const) {
  process.once(name, () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: settings.host, port: settings.port });
} catch {
  app.log.error('Agent could not listen on the configured address');
  process.exitCode = 1;
}
