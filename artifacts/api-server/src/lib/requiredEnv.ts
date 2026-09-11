export function getRequiredEnv(name: string, message?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(message ?? `[FATAL] ${name} is not set. Refusing to start.`);
  }
  return value;
}
