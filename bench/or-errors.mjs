/**
 * Why a model reply that arrived as HTTP 200 should still be retried, or null
 * when it should not.
 *
 * OpenRouter reports an upstream rate limit as a 200 whose body is
 * `{"error":{"code":429,...}}` with no `choices`. post() retries a 429 status
 * with backoff, but this one got through as a success, and the adapter then
 * threw "no choices". That ended the run: abec17-sol, abod104-sol and
 * absi31-sol (GPT-6.1 Sol, five boxes started at once) stopped after 6-19
 * turns on "openai/gpt-6.1-sol is temporarily rate-limited upstream".
 *
 * Retried: an error body with code 429 or 5xx and no choices. Any other error
 * body (a 400-class request fault) is not retried: repeating it cannot help.
 */
export function bodyRetryReason(json) {
  if (!json || typeof json !== 'object' || json.choices?.length) return null;
  const code = Number(json.error?.code ?? json.error?.status);
  if (code === 429 || code >= 500) return `body error ${code}: ${String(json.error?.message ?? '').slice(0, 120)}`;
  return null;
}
