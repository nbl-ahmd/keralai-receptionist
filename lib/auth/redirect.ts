/** Reject protocol-relative URLs, backslashes and control characters before browser normalization. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/dashboard';
  try {
    const base = 'https://workspace.invalid';
    const target = new URL(value, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : '/dashboard';
  } catch { return '/dashboard'; }
}
