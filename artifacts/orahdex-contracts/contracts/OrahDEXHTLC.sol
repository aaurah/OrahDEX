// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * OrahDEXHTLC — Hash Time Locked Contract for cross-chain settlement
 *
 * Supports both native coin (ETH/BNB/MATIC/AVAX) and ERC-20 token locks.
 * The secret hash is SHA-256 (same as BSV HTLC, enabling atomic cross-chain swaps).
 *
 * Flow:
 *   1. Maker calls lockETH() / lockToken() — funds held in contract
 *   2. Taker (relayer) calls reveal(secret) before timelock — funds released to recipient
 *   3. If reveal never happens, maker calls refund() after timelockUnix — funds returned
 *
 * Deployed on: ETH (1), BSC (56), Polygon (137), Base (8453),
 *              Arbitrum (42161), Optimism (10), Avalanche (43114), zkSync (324)
 */
contract OrahDEXHTLC is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Lock {
        address payable sender;
        address payable recipient;
        address  token;        // address(0) = native coin (ETH/BNB/MATIC/…)
        uint256  amount;
        bytes32  secretHash;   // SHA-256 hash of the 32-byte secret
        uint256  timelockUnix; // Unix timestamp after which sender can refund
        bool     revealed;
        bool     refunded;
    }

    mapping(bytes32 => Lock) public locks;

    event Locked(
        bytes32 indexed id,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelockUnix
    );
    event Revealed(bytes32 indexed id, bytes32 secret, address indexed recipient, uint256 amount);
    event Refunded(bytes32 indexed id, address indexed sender, uint256 amount);

    // ── Lock native coin (ETH / BNB / MATIC / AVAX …) ───────────────────────
    function lockETH(
        bytes32  id,
        bytes32  secretHash,
        address payable recipient,
        uint256  timelockUnix
    ) external payable nonReentrant {
        require(msg.value > 0,                   "Amount must be > 0");
        require(timelockUnix > block.timestamp,  "Timelock must be in the future");
        require(locks[id].amount == 0,           "Lock ID already exists");
        require(recipient != address(0),         "Invalid recipient");

        locks[id] = Lock({
            sender:       payable(msg.sender),
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

    // ── Lock ERC-20 token ────────────────────────────────────────────────────
    function lockToken(
        bytes32  id,
        bytes32  secretHash,
        address  token,
        uint256  amount,
        address payable recipient,
        uint256  timelockUnix
    ) external nonReentrant {
        require(amount > 0,                      "Amount must be > 0");
        require(timelockUnix > block.timestamp,  "Timelock must be in the future");
        require(locks[id].amount == 0,           "Lock ID already exists");
        require(recipient != address(0),         "Invalid recipient");
        require(token != address(0),             "Use lockETH for native coin");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        locks[id] = Lock({
            sender:       payable(msg.sender),
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

    // ── Recipient reveals secret to claim funds (before timelock) ────────────
    function reveal(bytes32 id, bytes32 secret) external nonReentrant {
        Lock storage lock = locks[id];
        require(lock.amount > 0,                        "Lock not found");
        require(!lock.revealed,                         "Already revealed");
        require(!lock.refunded,                         "Already refunded");
        require(block.timestamp < lock.timelockUnix,   "Timelock expired");
        require(sha256(abi.encodePacked(secret)) == lock.secretHash, "Invalid secret");

        lock.revealed = true;

        if (lock.token == address(0)) {
            lock.recipient.transfer(lock.amount);
        } else {
            IERC20(lock.token).safeTransfer(lock.recipient, lock.amount);
        }

        emit Revealed(id, secret, lock.recipient, lock.amount);
    }

    // ── Sender reclaims after timelock expires ───────────────────────────────
    function refund(bytes32 id) external nonReentrant {
        Lock storage lock = locks[id];
        require(lock.amount > 0,                       "Lock not found");
        require(!lock.revealed,                        "Already revealed");
        require(!lock.refunded,                        "Already refunded");
        require(block.timestamp >= lock.timelockUnix, "Timelock not expired");
        require(msg.sender == lock.sender,             "Only sender can refund");

        lock.refunded = true;

        if (lock.token == address(0)) {
            lock.sender.transfer(lock.amount);
        } else {
            IERC20(lock.token).safeTransfer(lock.sender, lock.amount);
        }

        emit Refunded(id, lock.sender, lock.amount);
    }

    // ── View helpers ─────────────────────────────────────────────────────────
    function getLock(bytes32 id) external view returns (
        address sender,
        address recipient,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelockUnix,
        bool    revealed,
        bool    refunded
    ) {
        Lock storage lock = locks[id];
        return (
            lock.sender, lock.recipient, lock.token, lock.amount,
            lock.secretHash, lock.timelockUnix, lock.revealed, lock.refunded
        );
    }

    function isLocked(bytes32 id) external view returns (bool) {
        Lock storage lock = locks[id];
        return lock.amount > 0
            && !lock.revealed
            && !lock.refunded
            && block.timestamp < lock.timelockUnix;
    }
}
