---
name: Deploy stops dev workflows
description: Publishing/deploying an OrahDEX checkpoint can leave dev workflows stopped, making the preview appear blank/broken.
---

## Rule
After a deployment/publish action completes, check `refresh_all_logs` for workflow status. If workflows show `NOT_STARTED`, that's the actual cause of "preview not working" — not a code bug.

## How to apply
1. `refresh_all_logs` first to confirm status before touching any code.
2. If workflows are `NOT_STARTED`, just `restart_workflow` for each (api-server, bsv-dex web, mockup-sandbox) — no code changes needed.
3. Screenshot the preview after restart to confirm.

## Why
The publish/deploy flow builds a separate production bundle; it can interrupt or stop the dev-environment workflows as a side effect, which is unrelated to any app code issue.
