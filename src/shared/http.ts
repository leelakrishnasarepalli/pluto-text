export async function postJsonWithTimeout(
  url: string,
  body: unknown,
  timeoutMs: number,
  init?: Omit<RequestInit, "method" | "body" | "signal">,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
