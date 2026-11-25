# OraAI and DevAI runtime

Ora chat (including the widget), market insights, and DevAI can use the API VM's loopback-only Ollama service. Setting a model name does not install its weights. Preview and published runtimes must be provisioned separately.

## Model selection

- `DEVAI_OLLAMA_ENABLED=true` explicitly selects local Ollama. There is no automatic switch to a hosted provider when the local model is unavailable.
- `DEVAI_MODEL` selects DevAI's model (default `qwen2.5-coder:1.5b`).
- `ORA_AI_MODEL` optionally selects a separate Ora model. Otherwise it uses the DevAI model.
- Names must match installed Ollama tags exactly. An omitted tag means `:latest`, not any installed size or quantization.
- `DEVAI_OLLAMA_BASE_URL` must remain loopback HTTP on port 11434. Do not expose an unauthenticated Ollama endpoint publicly.

Admin → DevAI lists the selected tag, installed tags, runtime, and measured memory. Its download action installs the configured DevAI tag only. For a distinct Ora tag, an operator must provision that exact tag in the same Ollama store.

When local inference is disabled, Ora chat uses the explicitly configured Anthropic integration and insights uses the explicitly configured OpenAI integration. DevAI remains local-only. A key's presence does not verify provider provisioning or quota; readiness labels distinguish unverified configuration from a successful call.

## Memory safety

Service startup and model downloads retain their free-memory thresholds: **3.5 GiB in development and 6 GiB in production**. Readiness uses the lower of cgroup headroom and Linux `MemAvailable`. They can differ substantially; Ollama can reject a load even when cgroup accounting alone appears to allow it.

Inference admission is separate: it reserves 1 GiB for the development API (2 GiB in production), plus a conservative estimate of the selected model's weights, context, and runner overhead. Only the exact selected model's verified resident CPU allocation can reduce that estimate; another model or a GPU allocation gives no credit. Missing model-size metadata falls back to the startup-sized budget, and missing runner metadata is treated as a cold load. The estimate is not a guarantee; Ollama can still reject inference, which must be reported to the user.

Readiness requests can retry loopback Ollama startup after temporary memory pressure clears, without an API restart. Recovery is single-flight, has a one-minute spawn cooldown, preserves all memory checks, and is development-only. The published launcher still owns production startup.

Do not bypass these checks, raise Node's heap without budgeting total RAM, or attempt to load an untagged larger model to work around a missing small tag. The API and frontend also need memory. A published 2 GB VM cannot meet the local inference threshold.

Ora's native Ollama streaming requests bound context to 2,048 tokens, generated output to 1,024 tokens, and keep-alive to 30 seconds. DevAI keeps its larger code/tool context and limits its tool rounds, total request duration, and generated output. Some small Qwen tags reject native tools: only that specific rejection retries on the same model using an explicit, allowlisted JSON tool envelope.

## Readiness endpoints

- `GET /api/anthropic/status`: Ora chat/widget's selected provider and model.
- `GET /api/ai/status`: Ora insights' selected provider and model.
- `GET /api/admin/devai/status`: admin-only DevAI status, installed tags, and memory.

Responses include a `ready` boolean and an actionable `code`, such as `OLLAMA_MODEL_MISSING`, `OLLAMA_INSUFFICIENT_MEMORY`, `OLLAMA_UNREACHABLE`, `OLLAMA_DISABLED`, or `AI_PROVIDER_NOT_CONFIGURED`. A readiness response is a snapshot, not a guarantee that a later generation will succeed.

Model weights are not committed to Git or generated into the frontend. The model downloaded during workspace verification is only a local runtime cache; it is not a published provisioning solution and can disappear when that runtime is replaced. A durable published setup must provision a protected model store separately and has not been deployed by this change.

## Verification and limits

The focused runtime tests exercise exact tag selection, missing/disabled/unreachable models, host versus cgroup memory checks, production headroom, measured resident-runner budgets, native stream conversion, output limits, model-service recovery, Ora's factual route boundaries, and the allowlisted Qwen tool flow.

Live preview verification used the installed `qwen2.5-coder:1.5b`: Ora streamed a real response distinguishing BSV settlement from EVM swaps, and authenticated DevAI returned a real `read_project_file` call, its actual tool output, and a completed response. Test conversations and the temporary admin session were deleted/revoked. Preview `/api/health` returned HTTP 200. Readiness is model-aware and may return to unavailable when available memory drops below the cold-load or resident-model budget.

The `llama3.2:3b` model shown in another VM's report is not installed in this Replit runtime; do not silently change the selected model or claim the deployments are equivalent. The preview's Qwen model weights remain a runtime-local cache. This change was not published, and published AI endpoints were not verified.

API and web typechecks, the API build, and focused tests passed. A prior full API suite run surfaced an unrelated existing public worker-health test mismatch: it expects a no-first-run worker to be `starting`, while the current implementation applies startup-grace handling. This task does not change worker scheduling or that test.
