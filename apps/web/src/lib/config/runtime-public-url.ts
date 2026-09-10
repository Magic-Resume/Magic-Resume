/** Server-only site origin; read at request time so a digest can be promoted. */
export function runtimePublicUrl(): string {
  const url = new URL(
    process.env.APP_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://app.magic-resume.cn',
  );
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APP_PUBLIC_URL must be an HTTP(S) URL');
  }
  return url.origin;
}
