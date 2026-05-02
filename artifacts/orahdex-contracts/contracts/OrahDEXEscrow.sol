// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OrahDEXEscrow
 * @notice Locks ETH or ERC-20 tokens on-chain when a user places an order
 *         on OrahDEX. Funds are visible in any wallet's balance/DeFi view
 *         and are released by the OrahDEX relayer when an order fills or
 *         cancelled by the user at any time.
 *
 *  Flow:
 *    BUY  order → user calls lockETH() or lockERC20() → escrow holds funds
 *    SELL order → (base asset locked off-chain via wallet signing; no escrow needed)
 *    Order fills → relayer calls release(orderId, recipient)
 *    Order cancel → user (or relayer) calls cancel(orderId)
 */
contract OrahDEXEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────

    address public immutable relayer;

    struct Deposit {
        address depositor;   // who locked the funds
        address token;       // address(0) = native ETH
        uint256 amount;      // raw token units
        uint64  lockedAt;    // unix timestamp
        bool    released;    // true once released or cancelled
    }

    // orderId (keccak256 of DB UUID) → deposit
    mapping(bytes32 => Deposit) public deposits;

    // Track all order IDs per depositor for enumeration
    mapping(address => bytes32[]) public depositorOrders;

    // ── Events ───────────────────────────────────────────────────────────────

    event OrderLocked(
        bytes32 indexed orderId,
        address indexed depositor,
        address indexed token,
        uint256 amount
    );

    event OrderReleased(
        bytes32 indexed orderId,
        address indexed recipient,
        address token,
        uint256 amount
    );

    event OrderCancelled(
        bytes32 indexed orderId,
        address indexed depositor,
        address token,
        uint256 amount
    );

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _relayer) {
        require(_relayer != address(0), "OrahDEXEscrow: zero relayer");
        relayer = _relayer;
    }

    // ── Lock functions ───────────────────────────────────────────────────────

    /**
     * @notice Lock native ETH for a buy order.
     * @param orderId  keccak256 hash of the OrahDEX order UUID.
     */
    function lockETH(bytes32 orderId) external payable nonReentrant {
        require(msg.value > 0, "OrahDEXEscrow: zero ETH");
        require(deposits[orderId].depositor == address(0), "OrahDEXEscrow: already locked");

        deposits[orderId] = Deposit({
            depositor: msg.sender,
            token:     address(0),
            amount:    msg.value,
            lockedAt:  uint64(block.timestamp),
            released:  false
        });
        depositorOrders[msg.sender].push(orderId);

        emit OrderLocked(orderId, msg.sender, address(0), msg.value);
    }

    /**
     * @notice Lock an ERC-20 token for a buy order.
     *         Caller must have approved this contract to spend `amount`.
     * @param orderId  keccak256 hash of the OrahDEX order UUID.
     * @param token    ERC-20 contract address.
     * @param amount   Token amount in smallest units.
     */
    function lockERC20(
        bytes32 orderId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0,           "OrahDEXEscrow: zero amount");
        require(token  != address(0), "OrahDEXEscrow: invalid token");
        require(deposits[orderId].depositor == address(0), "OrahDEXEscrow: already locked");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        deposits[orderId] = Deposit({
            depositor: msg.sender,
            token:     token,
            amount:    amount,
            lockedAt:  uint64(block.timestamp),
            released:  false
        });
        depositorOrders[msg.sender].push(orderId);

        emit OrderLocked(orderId, msg.sender, token, amount);
    }

    // ── Release / Cancel ─────────────────────────────────────────────────────

    /**
     * @notice Release locked funds to `recipient` once the order fills.
     *         Only callable by the OrahDEX relayer.
     */
    function release(bytes32 orderId, address recipient) external nonReentrant {
        require(msg.sender == relayer, "OrahDEXEscrow: not relayer");
        Deposit storage dep = deposits[orderId];
        require(dep.depositor != address(0), "OrahDEXEscrow: no deposit");
        require(!dep.released,               "OrahDEXEscrow: already settled");

        dep.released = true;
        _send(dep.token, recipient, dep.amount);

        emit OrderReleased(orderId, recipient, dep.token, dep.amount);
    }

    /**
     * @notice Cancel an order and refund the depositor.
     *         Callable by the depositor themselves, or by the relayer
     *         (to service cancel requests from the OrahDEX backend).
     */
    function cancel(bytes32 orderId) external nonReentrant {
        Deposit storage dep = deposits[orderId];
        require(dep.depositor != address(0), "OrahDEXEscrow: no deposit");
        require(!dep.released,               "OrahDEXEscrow: already settled");
        require(
            msg.sender == dep.depositor || msg.sender == relayer,
            "OrahDEXEscrow: not authorized"
        );

        dep.released = true;
        address depositor = dep.depositor;
        _send(dep.token, depositor, dep.amount);

        emit OrderCancelled(orderId, depositor, dep.token, dep.amount);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /** @notice Returns all order IDs ever locked by `depositor`. */
    function getDepositorOrders(address depositor) external view returns (bytes32[] memory) {
        return depositorOrders[depositor];
    }

    /** @notice Returns the full Deposit struct for an order. */
    function getDeposit(bytes32 orderId) external view returns (Deposit memory) {
        return deposits[orderId];
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _send(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "OrahDEXEscrow: ETH send failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    receive() external payable {}
}
