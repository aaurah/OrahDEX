import Anthropic from "@anthropic-ai/sdk";

if (!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || !process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
  console.warn("[OrahDEX] AI_INTEGRATIONS_ANTHROPIC_BASE_URL / AI_INTEGRATIONS_ANTHROPIC_API_KEY not set — Anthropic AI features will be unavailable until the integration is provisioned.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "not-configured",
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
});
