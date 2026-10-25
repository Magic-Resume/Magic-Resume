import type { WidgetEnvelope } from '@magic-resume/genui';

/** Verification notices use one stable card per run; findings take precedence over a degraded check. */
export function verificationWidget(
  payload: unknown,
  runId: string | undefined,
  t: (key: string) => string,
): { widgetId: string; envelope: WidgetEnvelope } | null {
  const verification = payload as {
    suspectedFabrications?: unknown;
    status?: unknown;
    reason?: unknown;
  } | undefined;
  const items = verification?.suspectedFabrications;
  const widgetId = `verification:${runId ?? 'run'}`;
  if (Array.isArray(items) && items.length) {
    return { widgetId, envelope: { kind: 'fabrication_notice', props: { items } } };
  }
  if (verification?.status === 'degraded') {
    const attachment = verification.reason === 'attachment_unverifiable';
    return {
      widgetId,
      envelope: {
        kind: 'fabrication_notice',
        props: {
          title: t(attachment ? 'aiLab.widgets.verification.attachmentTitle' : 'aiLab.widgets.verification.degradedTitle'),
          body: t(attachment ? 'aiLab.widgets.verification.attachmentBody' : 'aiLab.widgets.verification.degradedBody'),
        },
      },
    };
  }
  return null;
}
