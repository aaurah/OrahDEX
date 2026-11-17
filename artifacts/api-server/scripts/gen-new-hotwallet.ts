/**
 * Key generation is intentionally disabled here.
 *
 * Printing a private key to either stdout or stderr exposes it to terminal and
 * log capture. Create/import wallet material with a trusted offline wallet,
 * then store required credentials using the workspace Secrets flow.
 */
console.error(
  "Disabled: this utility must not generate or print private keys. " +
  "Use an offline wallet and the workspace Secrets flow instead.",
);
process.exitCode = 1;
