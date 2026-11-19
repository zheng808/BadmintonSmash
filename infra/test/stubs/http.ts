// Tiny stand-in for api/src/lambda/http.ts, used only for infra tests and synth checks.
export const handler = async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, version: 'stub' }) });
