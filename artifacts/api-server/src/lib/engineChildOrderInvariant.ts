export interface EngineParentRef {
  id: string;
  walletAddress: string;
  authorizationRef?: string | null;
  fundingRef?: string | null;
}

/**
 * P0 guard: engine-created child orders must carry durable parent authorization
 * and a real reservation/funding reference. If the DB row does not expose them,
 * the engine must NOT manufacture orders.
 */
export function assertEngineChildOrderAuthorized(parent: EngineParentRef): void {
  const missing: string[] = [];
  if (!parent.id) missing.push("parentOrderId");
  if (!parent.authorizationRef) missing.push("authorizationRef");
  if (!parent.fundingRef) missing.push("fundingRef");
  if (missing.length) {
    throw new Error(
      `ENGINE_CHILD_ORDER_UNAUTHORIZED: ${missing.join(",")} missing for parent ${parent.id}`
    );
  }
}
