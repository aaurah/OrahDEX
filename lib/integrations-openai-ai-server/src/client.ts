import OpenAI from "openai";

// Instantiated without throwing — if env vars are absent the constructor
// still succeeds; individual API calls will reject with auth errors, which
// are already caught by the route try/catch blocks (returning HTTP 503).
export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
