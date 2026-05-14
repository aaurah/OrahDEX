// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Orah HTLC — Hash Time Lock Contract
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 *
 *   Non-custodial atomic settlement for Orah P2P trades on EVM chains.
 *   Supports both native ETH and any ERC-20 token (USDT, USDC, WBTC, etc.).
 *
 *   Orah is fully non-custodial — this contract never holds user funds
 *   beyond the duration of an active trade settlement window.
 *
 * ── SETTLEMENT FLOW ──────────────────────────────────────────────────────────
 *
 *   1. Matching engine (off-chain) pairs a buyer and a seller.
 *   2. Orah generates a random 32-byte `secret` server-side.
 *      - `secretHash = keccak256(abi.encodePacked(secret))` is shared.
 *   3. Seller calls `lockETH` (or `lockToken`) with `secretHash`, locking funds.
 *   4. Buyer calls `lockToken` (or `lockETH`) with the SAME `secretHash`.
 *   5. Orah relayer detects both locks and calls `reveal(secret)` on both.
 *      - `reveal()` can be called by anyone who knows the secret.
 *      - Funds flow: seller's lock → buyer's address; buyer's lock → seller's address.
 *   6. If either party does NOT lock before `timelockUnix`, the other can call
 *      `refund()` to recover their funds after the timelock expires.
 *
 * ── SECURITY PROPERTIES ──────────────────────────────────────────────────────
 *
 *   • Atomic: either both parties receive funds or neither does (via refund).
 *   • Non-custodial: Orah cannot steal funds; it only reveals the preimage.
 *   • Trustless: after `lockETH`/`lockToken`, the counterparty's lock is
 *     independently verifiable on-chain before committing.
 *   • Refundable: if settlement stalls, `refund()` enforces the time guarantee.
 *   • Re-entrancy safe: state mutated before transfers.
 *
 * ── LOCK IDs ─────────────────────────────────────────────────────────────────
 *
 *   Each lock has a unique `bytes32 id`.  Orah generates:
 *     sellerLockId = keccak256(abi.encodePacked(tradeId, "_seller"))
 *     buyerLockId  = keccak256(abi.encodePacked(tradeId, "_buyer"))
 *
 *   The same `secretHash` is used for both locks, so a single `reveal()` on
 *   each lock settles the trade atomically.
 *
 * ── TIMELOCK ─────────────────────────────────────────────────────────────────
 *
 *   `timelockUnix` is a Unix timestamp (seconds).  Recommend:
 *     buyer's lock:  now + 15 min  (inner; expires first)
 *     seller's lock: now + 30 min  (outer; longer safety window)
 *
 *   This asymmetric timeout ensures the relayer can reveal before either
 *   party can refund, while giving the seller extra time if the relayer is slow.
 *
 * ── DEPLOYED ADDRESSES ───────────────────────────────────────────────────────
 *
 *   Ethereum Mainnet  (chainId=1):   see Orah docs / .env EVM_HTLC_CONTRACT_ETH
 *   Polygon Mainnet   (chainId=137): see Orah docs / .env EVM_HTLC_CONTRACT_POLYGON
 *   BNB Smart Chain   (chainId=56):  see Orah docs / .env EVM_HTLC_CONTRACT_BSC
 *
 *   Source: https://github.com/orah/contracts
 *   Founder: Parminder Singh (Aura · OrahDEX · Aaurah)
 *   Version: 4.2.0  |  Published: 9 April 2026
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract OrahHTLC {

    // ── Storage ───────────────────────────────────────────────────────────────

    struct Lock {
        address sender;          // party who locked (must call refund after expiry)
        address recipient;       // party who receives on reveal
        address token;           // address(0) = native ETH; otherwise ERC-20 address
        uint256 amount;          // ETH in wei, or token in token's smallest unit
        bytes32 secretHash;      // keccak256(abi.encodePacked(secret))
        uint256 timelockUnix;    // Unix timestamp; block.timestamp must be >= this to refund
        bool    revealed;        // true once relayer called reveal()
        bool    refunded;        // true once sender called refund() after expiry
    }

    mapping(bytes32 => Lock) private _locks;

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * Emitted when a new HTLC lock is created.
     * Off-chain relayer monitors this to detect when both sides have locked.
     */
    event Locked(
        bytes32 indexed id,
        address indexed sender,
        address indexed recipient,
        address  token,
        uint256  amount,
        bytes32  secretHash,
        uint256  timelockUnix
    );

    /**
     * Emitted when the relayer reveals the preimage and funds flow to recipient.
     * The `secret` field allows on-chain auditability of the atomic swap.
     */
    event Revealed(
        bytes32 indexed id,
        bytes32 secret,
        address indexed recipient,
        uint256 amount
    );

    /**
     * Emitted when the sender reclaims funds after timelock expiry.
     */
    event Refunded(
        bytes32 indexed id,
        address indexed sender,
        uint256 amount
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error ZeroAmount();
    error TimelockInPast();
    error LockNotFound();
    error LockAlreadyExists();
    error InvalidRecipient();
    error InvalidToken();
    error AlreadyRevealed();
    error AlreadyRefunded();
    error WrongSecret();
    error TimelockNotExpired();
    error TransferFailed();

    // ── Lock creation ─────────────────────────────────────────────────────────

    /**
     * Lock native ETH for atomic settlement.
     *
     * @param id            Unique bytes32 lock identifier (e.g., keccak256(tradeId+"_seller"))
     * @param secretHash    keccak256(abi.encodePacked(secret)) — must match buyer's lock
     * @param recipient     Address that will receive ETH on successful reveal
     * @param timelockUnix  Unix timestamp after which sender can refund (min 10 min recommended)
     */
    function lockETH(
        bytes32 id,
        bytes32 secretHash,
        address recipient,
        uint256 timelockUnix
    ) external payable {
        if (msg.value == 0)               revert ZeroAmount();
        if (timelockUnix <= block.timestamp) revert TimelockInPast();
        if (_locks[id].sender != address(0)) revert LockAlreadyExists();
        if (recipient == address(0))      revert InvalidRecipient();

        _locks[id] = Lock({
            sender:       msg.sender,
            recipient:    recipient,
            token:        address(0),
            amount:       msg.value,
            secretHash:   secretHash,
            timelockUnix: timelockUnix,
            revealed:     false,
            refunded:     false
        });

        emit Locked(id, msg.sender, recipient, address(0), msg.value, secretHash, timelockUnix);
    }

    /**
     * Lock an ERC-20 token for atomic settlement.
     *
     * Caller must have approved this contract for at least `amount` tokens.
     *
     * @param id            Unique bytes32 lock identifier (e.g., keccak256(tradeId+"_buyer"))
     * @param secretHash    keccak256(abi.encodePacked(secret)) — must match seller's lock
     * @param token         ERC-20 token contract address (e.g., USDT)
     * @param amount        Token amount in the token's smallest unit (e.g., USDT has 6 decimals)
     * @param recipient     Address that will receive tokens on successful reveal
     * @param timelockUnix  Unix timestamp after which sender can refund
     */
    function lockToken(
        bytes32 id,
        bytes32 secretHash,
        address token,
        uint256 amount,
        address recipient,
        uint256 timelockUnix
    ) external {
        if (amount == 0)                  revert ZeroAmount();
        if (timelockUnix <= block.timestamp) revert TimelockInPast();
        if (_locks[id].sender != address(0)) revert LockAlreadyExists();
        if (recipient == address(0))      revert InvalidRecipient();
        if (token == address(0))          revert InvalidToken();

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        _locks[id] = Lock({
            sender:       msg.sender,
            recipient:    recipient,
            token:        token,
            amount:       amount,
            secretHash:   secretHash,
            timelockUnix: timelockUnix,
            revealed:     false,
            refunded:     false
        });

        emit Locked(id, msg.sender, recipient, token, amount, secretHash, timelockUnix);
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    /**
     * Reveal the secret and transfer locked funds to the recipient.
     *
     * Can be called by anyone — the Orah relayer calls this once both
     * sides have locked.  The caller reveals `secret`; if it hashes to the
     * stored `secretHash`, funds are released.
     *
     * This is the atomic settlement step — after this call the trade is final.
     *
     * @param id      Lock identifier
     * @param secret  32-byte preimage that keccak256-hashes to the stored secretHash
     */
    function reveal(bytes32 id, bytes32 secret) external {
        Lock storage lock = _locks[id];
        if (lock.sender == address(0))                           revert LockNotFound();
        if (lock.revealed)                                       revert AlreadyRevealed();
        if (lock.refunded)                                       revert AlreadyRefunded();
        if (keccak256(abi.encodePacked(secret)) != lock.secretHash) revert WrongSecret();

        lock.revealed = true;

        uint256 amount    = lock.amount;
        address recipient = lock.recipient;
        address token     = lock.token;

        if (token == address(0)) {
            (bool sent, ) = payable(recipient).call{ value: amount }("");
            if (!sent) revert TransferFailed();
        } else {
            bool ok = IERC20(token).transfer(recipient, amount);
            if (!ok) revert TransferFailed();
        }

        emit Revealed(id, secret, recipient, amount);
    }

    // ── Refund ────────────────────────────────────────────────────────────────

    /**
     * Reclaim locked funds after the timelock has expired.
     *
     * Only the original `sender` can refund.
     * Can only be called after `block.timestamp >= timelockUnix`.
     *
     * @param id  Lock identifier
     */
    function refund(bytes32 id) external {
        Lock storage lock = _locks[id];
        if (lock.sender == address(0))        revert LockNotFound();
        if (lock.revealed)                    revert AlreadyRevealed();
        if (lock.refunded)                    revert AlreadyRefunded();
        if (block.timestamp < lock.timelockUnix) revert TimelockNotExpired();

        lock.refunded = true;

        uint256 amount = lock.amount;
        address sender = lock.sender;
        address token  = lock.token;

        if (token == address(0)) {
            (bool sent, ) = payable(sender).call{ value: amount }("");
            if (!sent) revert TransferFailed();
        } else {
            bool ok = IERC20(token).transfer(sender, amount);
            if (!ok) revert TransferFailed();
        }

        emit Refunded(id, sender, amount);
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /**
     * Read a lock by ID.  Returns zero-value struct if not found.
     */
    function getLock(bytes32 id) external view returns (Lock memory) {
        return _locks[id];
    }

    /**
     * Check if a lock has been funded (sender != address(0)).
     */
    function isLocked(bytes32 id) external view returns (bool) {
        return _locks[id].sender != address(0);
    }
}
