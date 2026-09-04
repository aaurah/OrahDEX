import { parseAbi } from "viem";

// MUST use parseAbi() — viem's encodeFunctionData throws silently on raw strings.
export const ESCROW_ABI = parseAbi([
  "function lockETH(bytes32 orderId) external payable",
  "function lockERC20(bytes32 orderId, address token, uint256 amount) external",
  "function release(bytes32 orderId, address recipient) external",
  "function cancel(bytes32 orderId) external",
  "function getDeposit(bytes32 orderId) external view returns (address depositor, address token, uint256 amount, uint64 lockedAt, bool released)",
  "function getDepositorOrders(address depositor) external view returns (bytes32[])",
  "event OrderLocked(bytes32 indexed orderId, address indexed depositor, address indexed token, uint256 amount)",
  "event OrderReleased(bytes32 indexed orderId, address indexed recipient, address token, uint256 amount)",
  "event OrderCancelled(bytes32 indexed orderId, address indexed depositor, address token, uint256 amount)",
]);

/**
 * Escrow contract address per EVM chainId.
 *
 * IMPORTANT: Only include chains where the OrahDEXEscrow contract is actually
 * deployed and verified. Listing a chain here when the contract is NOT deployed
 * causes `escrowAvailable = true` for wallets on that chain, which opens the
 * lock dialog and then reverts on-chain — confusing the user.
 *
 * Mainnet deployments are pending. Only Sepolia is live.
 * When a mainnet chain is deployed, add it here with its confirmed address.
 *
 * Planned mainnet address (same via CREATE2 factory, pending deployment):
 *   0xeE234cEb85697b64800E696699b7841e00413B4f
 *   → ETH (1), OP (10), BSC (56), Unichain (130), Polygon (137),
 *     zkSync (324), Sei (1329), Base (8453), Arbitrum (42161),
 *     Avalanche (43114), Linea (59144), Scroll (534352)
 */
export const ESCROW_ADDRESSES: Record<number, string> = {
  11155111: "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2",  // Sepolia ✓ live
};

/** The OrahDEX relayer address that can release / cancel escrow deposits. */
export const RELAYER_ADDRESS = "0x5A391a3A2d6d885C412FE24be624126694de08dA";

/** Default chainId for escrow — Sepolia (the only currently live deployment). */
export const ESCROW_CHAIN_ID = 11155111;

/** Returns true when an escrow contract is deployed on the given chainId. */
export function isEscrowSupported(chainId: number): boolean {
  return chainId in ESCROW_ADDRESSES;
}
