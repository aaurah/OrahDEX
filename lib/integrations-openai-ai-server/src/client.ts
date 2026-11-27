import OpenAI from "openai";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  console.warn(
    "[OrahDEX] AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY not set — " +
    "AI image generation will be unavailable until the OpenAI integration is provisioned."
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
