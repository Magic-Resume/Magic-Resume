import { NextRequest, NextResponse } from 'next/server';
import { aiBackendUrl, fetchAiBackend } from '@/lib/ai/backend';

/** Connection tests follow the same backend boundary as chat and imports. */
export async function POST(req: NextRequest) {
  if (!aiBackendUrl()) {
    return NextResponse.json(
      { ok: false, errorCode: 'misconfigured', subCode: 'ai_backend_not_configured', message: 'AI_BACKEND_URL is not configured', status: 503 },
      { status: 503 },
    );
  }
  const config = await req.json().catch(() => null);
  if (!config || ![config.apiKey, config.baseUrl, config.model].every((value) => typeof value === 'string' && value.trim())) {
    return NextResponse.json({ ok: false, message: 'Missing model configuration', status: 400 }, { status: 400 });
  }
  try {
    const { provider, apiKey, baseUrl, model } = config;
    const response = await fetchAiBackend('/api/test-llm', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(30_000)]),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Could not reach the AI backend', status: 502 },
      { status: 502 },
    );
  }
}
