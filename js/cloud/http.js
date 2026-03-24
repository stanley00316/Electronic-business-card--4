/**
 * 含逾時的 fetch
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  const ms = Math.max(parseInt(timeoutMs || 0, 10) || 0, 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { ...(options || {}), signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}