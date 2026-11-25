import { randomUUID } from "node:crypto";

/** Accept only explicit JSON tool envelopes, never arbitrary prose or code. */
export function parseLocalToolCall(content: string, allowedNames: ReadonlySet<string>) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const candidate of [fenced, content]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim()) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") continue;
      const call = (parsed.tool_call && typeof parsed.tool_call === "object" ? parsed.tool_call : parsed) as Record<string, unknown>;
      const name = typeof call.name === "string" ? call.name : "";
      const raw = call.arguments ?? call.parameters ?? {};
      const args = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!allowedNames.has(name) || !args || typeof args !== "object" || Array.isArray(args)) continue;
      return [{ id: randomUUID(), type: "function" as const, function: { name, arguments: JSON.stringify(args) } }];
    } catch { /* ordinary assistant output is not executable */ }
  }
  return [];
}

/**
 * A user explicitly naming a DevAI tool is an unambiguous routing hint. Pass
 * only those requested schemas to small local models; this avoids drowning a
 * simple single-file lookup in every exchange/GitHub/database tool definition.
 */
export function selectExplicitlyRequestedTools<T extends { function: { name: string } }>(
  content: string,
  tools: readonly T[],
): T[] {
  const lower = content.toLowerCase();
  const explicitlyRequested = tools.filter(tool =>
    lower.includes(tool.function.name.toLowerCase()),
  );
  return explicitlyRequested.length ? explicitlyRequested : [...tools];
}

/** For a user-requested single tool, return its verified data without a slow,
 * second model call that could fabricate a summary or time out after success. */
export function formatExplicitToolResult(
  content: string,
  selectedToolNames: readonly string[],
  executedToolName: string,
  output: string,
): string | null {
  const explicitlySelected = selectedToolNames.length === 1
    && content.toLowerCase().includes(selectedToolNames[0]!.toLowerCase())
    && selectedToolNames[0] === executedToolName;
  return explicitlySelected ? `Verified result from ${executedToolName}:\n${output}` : null;
}

/** Some small Qwen tags support text JSON calls but reject native tool fields. */
export async function completeWithLocalTools(
  create: (body: any, options: any) => Promise<any>,
  body: { messages: any[]; tools: any[]; [key: string]: any },
  options: any,
) {
  try { return await create(body, options); }
  catch (error) {
    const failure = error as { status?: number; message?: string };
    if (failure.status !== 400 || !/does not support tools/i.test(failure.message ?? "")) throw error;
    const { tools, tool_choice: _choice, ...plain } = body;
    return create({
      ...plain,
      messages: [
        ...body.messages,
        {
          role: "system",
          content: `This model uses text JSON for tools. To call one tool, reply only with {"tool_call":{"name":"allowed_name","arguments":{}}}. Otherwise reply normally. Only these tools are allowed: ${JSON.stringify(tools.map(tool => tool.function))}`,
        },
      ],
    }, options);
  }
}
