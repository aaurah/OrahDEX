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
 * All mainnets are DEPLOYED at the same CREATE2 address
 * (verified on-chain via eth_getCode + relayer() on 2026-09-05):
 *   0xeE234cEb85697b64800E696699b7841e00413B4f
 *   → ETH (1), OP (10), BSC (56), Unichain (130), Polygon (137),
 *     zkSync (324), Sei (1329), Base (8453), Arbitrum (42161),
 *     Avalanche (43114), Linea (59144), Scroll (534352)
 */
const MAINNET_ESCROW_ADDRESS = "0xeE234cEb85697b64800E696699b7841e00413B4f";

export const ESCROW_ADDRESSES: Record<number, string> = {
  1:      MAINNET_ESCROW_ADDRESS,  // Ethereum      ✓ live
  10:     MAINNET_ESCROW_ADDRESS,  // Optimism      ✓ live
  56:     MAINNET_ESCROW_ADDRESS,  // BSC           ✓ live
  130:    MAINNET_ESCROW_ADDRESS,  // Unichain      ✓ live
  137:    MAINNET_ESCROW_ADDRESS,  // Polygon       ✓ live
  324:    MAINNET_ESCROW_ADDRESS,  // zkSync Era    ✓ live
  1329:   MAINNET_ESCROW_ADDRESS,  // Sei           ✓ live
  8453:   MAINNET_ESCROW_ADDRESS,  // Base          ✓ live
  42161:  MAINNET_ESCROW_ADDRESS,  // Arbitrum      ✓ live
  43114:  MAINNET_ESCROW_ADDRESS,  // Avalanche     ✓ live
  59144:  MAINNET_ESCROW_ADDRESS,  // Linea         ✓ live
  534352: MAINNET_ESCROW_ADDRESS,  // Scroll        ✓ live
  11155111: "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2",  // Sepolia ✓ live
};

/** The OrahDEX relayer address that can release / cancel escrow deposits. */
export const RELAYER_ADDRESS = "0x5A391a3A2d6d885C412FE24be624126694de08dA";

/** Default chainId for escrow — Sepolia testnet (mainnets also live). */
export const ESCROW_CHAIN_ID = 11155111;

/** Returns true when an escrow contract is deployed on the given chainId. */
export function isEscrowSupported(chainId: number): boolean {
  return chainId in ESCROW_ADDRESSES;
}
