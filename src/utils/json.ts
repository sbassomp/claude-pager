export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.debug('[json] Failed to parse:', raw.slice(0, 100));
    return fallback;
  }
}
