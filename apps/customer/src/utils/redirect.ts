/**
 * Only same-app relative paths are allowed as post-login destinations
 * (blocks `//evil.com` and `https://…` open redirects).
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}

/** `/login?redirect=<where the user was trying to go>` */
export function loginPath(returnTo: string): string {
  return `/login?redirect=${encodeURIComponent(returnTo)}`;
}
