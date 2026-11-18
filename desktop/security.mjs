import path from 'node:path';

export const APP_URL = 'primeboard://app/';
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "connect-src 'self'", "media-src 'self' blob:",
  "worker-src 'self'", "object-src 'none'", "frame-src 'none'",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

export function isAppURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'primeboard:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}

export function assetPath(value, root) {
  if (!isAppURL(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (/[\\\0:]/.test(pathname) || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) return null;
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, file);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? file : null;
  } catch { return null; }
}

export function externalURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function allowedPermission(permission, requestingURL, contentsURL, isMainFrame = true) {
  // Chromium uses the shared midiSysex permission prompt even for sysex:false.
  // The instrument always requests basic MIDI; no outside page gets this grant.
  return isMainFrame !== false && isAppURL(requestingURL) && isAppURL(contentsURL)
    && ['midi', 'midiSysex', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
}

export function allowedDownload(value, contentsURL) {
  if (!isAppURL(contentsURL)) return false;
  return isAppURL(value) || (value.startsWith('blob:') && isAppURL(value.slice(5)));
}
