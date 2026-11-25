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

Local inference and downloads require the existing free-memory thresholds: **3.5 GiB in development and 6 GiB in production**. Readiness uses the lower of cgroup headroom and Linux `MemAvailable`. They can differ substantially; Ollama can reject a load even when cgroup accounting alone appears to allow it.

Do not bypass these checks, raise Node's heap without budgeting total RAM, or attempt to load an untagged larger model to work around a missing small tag. The API and frontend also need memory. A published 2 GB VM cannot meet the local inference threshold.

Ora's native Ollama streaming requests bound context to 2,048 tokens, generated output to 1,024 tokens, and keep-alive to 30 seconds. DevAI keeps its larger code/tool context and limits its tool rounds, total request duration, and generated output. Some small Qwen tags reject native tools: only that specific rejection retries on the same model using an explicit, allowlisted JSON tool envelope.

## Readiness endpoints

- `GET /api/anthropic/status`: Ora chat/widget's selected provider and model.
- `GET /api/ai/status`: Ora insights' selected provider and model.
- `GET /api/admin/devai/status`: admin-only DevAI status, installed tags, and memory.

Responses include a `ready` boolean and an actionable `code`, such as `OLLAMA_MODEL_MISSING`, `OLLAMA_INSUFFICIENT_MEMORY`, `OLLAMA_UNREACHABLE`, `OLLAMA_DISABLED`, or `AI_PROVIDER_NOT_CONFIGURED`. A readiness response is a snapshot, not a guarantee that a later generation will succeed.

Model weights are not committed to Git or generated into the frontend. The model downloaded during workspace verification is only a local runtime cache; it is not a published provisioning solution and can disappear when that runtime is replaced. A durable published setup must provision a protected model store separately and has not been deployed by this change.

## Verification and limits

The focused runtime tests exercise exact tag selection, missing/disabled/unreachable models, host versus cgroup memory checks, production headroom, native stream conversion, output limits, and the allowlisted Qwen tool fallback.

Live testing downloaded `qwen2.5-coder:1.5b`, but Ollama refused inference because model memory requirements exceeded available host memory. After restarting the API, the autostart guard correctly kept Ollama stopped due to insufficient free memory. A real generated Ora/DevAI answer is **not verified on this VM**. Do not describe these changes as working live inference until an adequately provisioned runtime completes both prompts and a safe DevAI tool call.

API and web typechecks and the frontend build passed. The API workflow rebuilt and started successfully. The full API suite has an unrelated existing failure in the public worker-health regression: it expects a no-first-run worker to be `starting`, while the current worker implementation uses startup grace handling. This task does not change worker scheduling or that test.
