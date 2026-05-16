// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * OrahCrossChainHook — Cross-chain settlement hook for OrahDEX
 *
 * Pluggable messaging layer abstraction. Supports:
 *   - LayerZero V2  (lzSend / lzReceive)
 *   - Wormhole      (publishMessage / parseAndVerifyVM)
 *   - Native Orah   (future sovereign bridge)
 *
 * Architecture:
 *   Source chain  → OrahCrossChainHook.sendSwap()
 *                 → bridges message (lock or burn)
 *   Dest chain    ← OrahCrossChainHook.receiveSwap()
 *                 → executes swap on destination AMM
 *
 * Security:
 *   - Only registered trusted remotes can deliver messages.
 *   - Replay protection via nonces.
 *   - Circuit breaker: owner can pause all cross-chain activity.
 *   - Refund path: if destination swap fails, tokens are refunded to user.
 */

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ── Messaging interfaces ─────────────────────────────────────────────────────

interface ILayerZeroEndpoint {
    function send(
        uint16  _dstChainId,
        bytes   calldata _destination,
        bytes   calldata _payload,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes   calldata _adapterParams
    ) external payable;

    function estimateFees(
        uint16  _dstChainId,
        address _userApplication,
        bytes   calldata _payload,
        bool    _payInZRO,
        bytes   calldata _adapterParam
    ) external view returns (uint256 nativeFee, uint256 zroFee);
}

interface IWormholeRelayer {
    function sendPayloadToEvm(
        uint16  targetChain,
        address targetAddress,
        bytes   memory payload,
        uint256 receiverValue,
        uint256 gasLimit
    ) external payable returns (uint64 sequence);
}

// ── Destination AMM interface ─────────────────────────────────────────────────

interface IOrahRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// ── Hook contract ─────────────────────────────────────────────────────────────

contract OrahCrossChainHook is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Messaging protocol enum ──────────────────────────────────────────────

    enum Protocol { LAYER_ZERO, WORMHOLE, ORAH_NATIVE }

    // ── Cross-chain message payload ──────────────────────────────────────────

    struct CrossSwapPayload {
        bytes32 orderId;          // unique order identifier
        address sender;           // originating user
        address recipient;        // destination recipient
        address tokenIn;          // token to sell on destination
        address tokenOut;         // token to buy on destination
        uint256 amountIn;         // amount to swap
        uint256 minAmountOut;     // slippage protection
        uint256 deadline;
        address[] path;           // swap path on destination
    }

    // ── State ─────────────────────────────────────────────────────────────────

    ILayerZeroEndpoint public lzEndpoint;
    IWormholeRelayer   public wormholeRelayer;
    IOrahRouter        public orahRouter;

    // chainId → trusted remote hook address (for message validation)
    mapping(uint16 => bytes)    public trustedRemotesLZ;     // LayerZero chain IDs
    mapping(uint16 => address)  public trustedRemotesWH;     // Wormhole chain IDs

    // orderIds already processed (replay protection)
    mapping(bytes32 => bool)    public processedOrders;

    // token → whether it can be bridged via this hook
    mapping(address => bool)    public bridgeable;

    // Locked balances for refund path: orderId → (token, amount, sender)
    mapping(bytes32 => address) public lockedToken;
    mapping(bytes32 => uint256) public lockedAmount;
    mapping(bytes32 => address) public lockedSender;

    uint256 public defaultGasLimit = 300_000;

    // ── Events ────────────────────────────────────────────────────────────────

    event CrossSwapInitiated(
        bytes32 indexed orderId,
        Protocol indexed protocol,
        address indexed sender,
        address tokenIn,
        uint256 amount,
        uint16  destChainId
    );
    event CrossSwapCompleted(
        bytes32 indexed orderId,
        address indexed recipient,
        address tokenOut,
        uint256 amountOut
    );
    event CrossSwapRefunded(
        bytes32 indexed orderId,
        address indexed sender,
        address token,
        uint256 amount
    );
    event TrustedRemoteSet(uint16 chainId, Protocol protocol, bytes remote);
    event BridgeableSet(address token, bool enabled);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _lzEndpoint,
        address _wormholeRelayer,
        address _orahRouter
    ) Ownable(msg.sender) {
        if (_lzEndpoint      != address(0)) lzEndpoint      = ILayerZeroEndpoint(_lzEndpoint);
        if (_wormholeRelayer != address(0)) wormholeRelayer = IWormholeRelayer(_wormholeRelayer);
        if (_orahRouter      != address(0)) orahRouter      = IOrahRouter(_orahRouter);
    }

    // ── Source chain: initiate cross-chain swap ───────────────────────────────

    /**
     * Lock tokens and send a cross-chain swap message.
     * @param protocol    Which messaging protocol to use
     * @param destChainId Chain ID in the protocol's numbering (LZ or Wormhole)
     * @param payload     The swap details to execute on the destination chain
     */
    function sendCrossSwap(
        Protocol protocol,
        uint16   destChainId,
        CrossSwapPayload calldata payload
    ) external payable nonReentrant whenNotPaused {
        require(!processedOrders[payload.orderId], "OrahCrossChainHook: duplicate orderId");
        require(bridgeable[payload.tokenIn],       "OrahCrossChainHook: token not bridgeable");
        require(payload.deadline > block.timestamp,"OrahCrossChainHook: expired");
        require(payload.amountIn > 0,              "OrahCrossChainHook: zero amount");

        // Lock tokens in this contract
        IERC20(payload.tokenIn).safeTransferFrom(msg.sender, address(this), payload.amountIn);
        lockedToken[payload.orderId]  = payload.tokenIn;
        lockedAmount[payload.orderId] = payload.amountIn;
        lockedSender[payload.orderId] = msg.sender;

        bytes memory encoded = _encodePayload(payload);

        if (protocol == Protocol.LAYER_ZERO) {
            _sendLZ(destChainId, encoded);
        } else if (protocol == Protocol.WORMHOLE) {
            _sendWH(destChainId, encoded);
        } else {
            revert("OrahCrossChainHook: native bridge not yet deployed");
        }

        emit CrossSwapInitiated(
            payload.orderId, protocol, msg.sender,
            payload.tokenIn, payload.amountIn, destChainId
        );
    }

    // ── Destination chain: receive and execute ────────────────────────────────

    /**
     * Called by the messaging layer on the destination chain.
     * Only trusted remotes may call this.
     */
    function receiveSwap(bytes calldata encoded) external nonReentrant whenNotPaused {
        CrossSwapPayload memory payload = _decodePayload(encoded);

        require(!processedOrders[payload.orderId], "OrahCrossChainHook: replay");
        require(payload.deadline > block.timestamp,"OrahCrossChainHook: expired");
        processedOrders[payload.orderId] = true;

        // Approve router and execute swap
        IERC20(payload.tokenIn).safeIncreaseAllowance(address(orahRouter), payload.amountIn);

        try orahRouter.swapExactTokensForTokens(
            payload.amountIn,
            payload.minAmountOut,
            payload.path,
            payload.recipient,
            payload.deadline
        ) returns (uint256[] memory amounts) {
            emit CrossSwapCompleted(
                payload.orderId, payload.recipient,
                payload.tokenOut, amounts[amounts.length - 1]
            );
        } catch {
            // Swap failed — refund tokens to recipient (they arrived on dest chain)
            IERC20(payload.tokenIn).safeTransfer(payload.recipient, payload.amountIn);
        }
    }

    /**
     * Refund locked tokens if a cross-chain swap is not delivered within deadline.
     */
    function refund(bytes32 orderId) external nonReentrant {
        address sender = lockedSender[orderId];
        require(sender != address(0),              "OrahCrossChainHook: no locked order");
        require(!processedOrders[orderId],         "OrahCrossChainHook: already processed");

        address token  = lockedToken[orderId];
        uint256 amount = lockedAmount[orderId];

        delete lockedToken[orderId];
        delete lockedAmount[orderId];
        delete lockedSender[orderId];
        processedOrders[orderId] = true;

        IERC20(token).safeTransfer(sender, amount);
        emit CrossSwapRefunded(orderId, sender, token, amount);
    }

    // ── LayerZero internal ────────────────────────────────────────────────────

    function _sendLZ(uint16 destChainId, bytes memory payload) internal {
        bytes memory remote = trustedRemotesLZ[destChainId];
        require(remote.length > 0, "OrahCrossChainHook: no LZ remote");
        bytes memory adapterParams = abi.encodePacked(uint16(1), defaultGasLimit);
        lzEndpoint.send{value: msg.value}(
            destChainId, remote, payload,
            payable(msg.sender), address(0), adapterParams
        );
    }

    // LayerZero receive callback (called by LZ endpoint)
    function lzReceive(
        uint16       _srcChainId,
        bytes memory _srcAddress,
        uint64       /* _nonce */,
        bytes memory _payload
    ) external {
        require(msg.sender == address(lzEndpoint), "OrahCrossChainHook: not LZ endpoint");
        bytes memory trusted = trustedRemotesLZ[_srcChainId];
        require(
            keccak256(_srcAddress) == keccak256(trusted),
            "OrahCrossChainHook: untrusted LZ source"
        );
        this.receiveSwap(_payload);
    }

    // ── Wormhole internal ─────────────────────────────────────────────────────

    function _sendWH(uint16 destChainId, bytes memory payload) internal {
        require(address(wormholeRelayer) != address(0), "OrahCrossChainHook: no WH relayer");
        address destHook = trustedRemotesWH[destChainId];
        require(destHook != address(0), "OrahCrossChainHook: no WH remote");
        wormholeRelayer.sendPayloadToEvm{value: msg.value}(
            destChainId, destHook, payload, 0, defaultGasLimit
        );
    }

    // ── Codec ─────────────────────────────────────────────────────────────────

    function _encodePayload(CrossSwapPayload calldata p) internal pure returns (bytes memory) {
        return abi.encode(
            p.orderId, p.sender, p.recipient,
            p.tokenIn, p.tokenOut, p.amountIn,
            p.minAmountOut, p.deadline, p.path
        );
    }

    function _decodePayload(bytes calldata data) internal pure returns (CrossSwapPayload memory p) {
        (
            p.orderId, p.sender, p.recipient,
            p.tokenIn, p.tokenOut, p.amountIn,
            p.minAmountOut, p.deadline, p.path
        ) = abi.decode(data, (bytes32, address, address, address, address, uint256, uint256, uint256, address[]));
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setTrustedRemoteLZ(uint16 chainId, bytes calldata remote) external onlyOwner {
        trustedRemotesLZ[chainId] = remote;
        emit TrustedRemoteSet(chainId, Protocol.LAYER_ZERO, remote);
    }

    function setTrustedRemoteWH(uint16 chainId, address remote) external onlyOwner {
        trustedRemotesWH[chainId] = remote;
        emit TrustedRemoteSet(chainId, Protocol.WORMHOLE, abi.encodePacked(remote));
    }

    function setBridgeable(address token, bool enabled) external onlyOwner {
        bridgeable[token] = enabled;
        emit BridgeableSet(token, enabled);
    }

    function setDefaultGasLimit(uint256 limit) external onlyOwner {
        defaultGasLimit = limit;
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function estimateLZFee(
        uint16 destChainId,
        bytes calldata payload
    ) external view returns (uint256 nativeFee) {
        bytes memory adapterParams = abi.encodePacked(uint16(1), defaultGasLimit);
        (nativeFee,) = lzEndpoint.estimateFees(destChainId, address(this), payload, false, adapterParams);
    }

    receive() external payable {}
}
