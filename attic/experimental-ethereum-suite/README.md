# EXPERIMENTAL — DO NOT DEPLOY
Quarantined 2026-09-27 after audit finding.
This Ethereum-only suite's OrahDEXHTLC verifies keccak256(secret).
BSV script (OP_SHA256) and the production relayer both use SHA-256 —
deploying this contract would break cross-chain reveal/settlement.
CANONICAL suite: artifacts/orahdex-contracts (deployed + wired).
