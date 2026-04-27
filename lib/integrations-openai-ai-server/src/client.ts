import OpenAI from "openai";

// Lazy singleton — created on first access so the module can be imported even
// when the AI env vars are not yet provisioned (e.g. during early startup).
// Routes that need AI will get a runtime error from the OpenAI SDK if the
// keys are missing, but the rest of the API server continues to function.
let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "",
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getClient() as any)[prop];
  },
});
