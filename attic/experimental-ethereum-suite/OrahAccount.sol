// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * OrahAccount — EIP-4337 Compatible Smart Account
 *
 * ── PURPOSE ───────────────────────────────────────────────────────────────────
 *   A minimal, auditable EIP-4337 smart account that gives Orah Wallet users:
 *   • Batch transactions  — approve + swap + stake in a single UserOp
 *   • Gas abstraction     — OrahDEX Paymaster pays gas in ORAH (opt-in)
 *   • Session keys        — time-limited keys for bots / advanced trading
 *   • Social recovery     — M-of-N guardian recovery (extensible)
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────────────
 *   Entry Point (EIP-4337): 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 *   The account is created by OrahAccountFactory via CREATE2 so the address
 *   is deterministic and counterfactual (usable before deployment).
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - Only owner (EOA) or EntryPoint can call execute / executeBatch.
 *   - Signature validation uses ecrecover on the UserOpHash (EIP-191 prefixed).
 *   - Re-entrancy safe: all state updated before external calls.
 *   - Session keys are scoped to a specific target + selector + expiry.
 */

interface IEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256);
    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);
    function depositTo(address account) external payable;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function balanceOf(address account) external view returns (uint256);
}

struct UserOperation {
    address sender;
    uint256 nonce;
    bytes   initCode;
    bytes   callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes   paymasterAndData;
    bytes   signature;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

library ECDSA {
    function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "ECDSA: bad sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        require(v == 27 || v == 28, "ECDSA: invalid v");
        return ecrecover(hash, v, r, s);
    }

    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
}

// ── OrahAccount ───────────────────────────────────────────────────────────────

contract OrahAccount {
    using ECDSA for bytes32;

    // ── Constants ─────────────────────────────────────────────────────────────
    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    uint256 internal constant SIG_VALIDATION_SUCCESS = 0;

    // ── State ─────────────────────────────────────────────────────────────────
    address public owner;
    OrahAccountFactory public factory;

    struct SessionKey {
        address target;       // allowed target contract (address(0) = any)
        bytes4  selector;     // allowed function selector (0 = any)
        uint256 expiresAt;    // unix timestamp
        bool    active;
    }
    mapping(address => SessionKey) public sessionKeys;

    // ── Events ────────────────────────────────────────────────────────────────
    event Executed(address indexed target, uint256 value, bytes data);
    event BatchExecuted(uint256 callCount);
    event SessionKeySet(address indexed key, address target, bytes4 selector, uint256 expiresAt);
    event SessionKeyRevoked(address indexed key);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    // ── Init (called once by factory) ─────────────────────────────────────────
    function initialize(address _owner) external {
        require(owner == address(0), "OrahAccount: already initialized");
        owner   = _owner;
        factory = OrahAccountFactory(msg.sender);
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner || msg.sender == ENTRY_POINT, "OrahAccount: unauthorized");
        _;
    }

    receive() external payable {}

    // ── EIP-4337: validateUserOp ──────────────────────────────────────────────
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 /*missingAccountFunds*/
    ) external returns (uint256 validationData) {
        require(msg.sender == ENTRY_POINT, "OrahAccount: not EntryPoint");

        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address signer = hash.recover(userOp.signature);

        if (signer == owner) return SIG_VALIDATION_SUCCESS;

        // Check session key
        SessionKey storage sk = sessionKeys[signer];
        if (sk.active && block.timestamp < sk.expiresAt) {
            // Decode callData target + selector
            if (userOp.callData.length >= 4) {
                bytes4 sel = bytes4(userOp.callData[:4]);
                // execute(address target, uint256 value, bytes calldata data)
                if (sel == OrahAccount.execute.selector && userOp.callData.length >= 36) {
                    address target;
                    assembly { target := calldataload(add(userOp.callData.offset, 4)) }
                    if ((sk.target == address(0) || sk.target == target) &&
                        (sk.selector == bytes4(0) || _innerSelector(userOp.callData) == sk.selector)) {
                        return SIG_VALIDATION_SUCCESS;
                    }
                }
            }
        }

        return SIG_VALIDATION_FAILED;
    }

    // ── Single call ───────────────────────────────────────────────────────────
    function execute(address target, uint256 value, bytes calldata data) external onlyOwnerOrEntryPoint {
        (bool ok, bytes memory ret) = target.call{ value: value }(data);
        if (!ok) { assembly { revert(add(ret, 32), mload(ret)) } }
        emit Executed(target, value, data);
    }

    // ── Batch call ────────────────────────────────────────────────────────────
    struct Call {
        address target;
        uint256 value;
        bytes   data;
    }

    function executeBatch(Call[] calldata calls) external onlyOwnerOrEntryPoint {
        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{ value: calls[i].value }(calls[i].data);
            if (!ok) { assembly { revert(add(ret, 32), mload(ret)) } }
        }
        emit BatchExecuted(calls.length);
    }

    // ── Session keys ──────────────────────────────────────────────────────────

    function setSessionKey(
        address key,
        address target,
        bytes4  selector,
        uint256 duration          // seconds
    ) external onlyOwnerOrEntryPoint {
        require(duration > 0 && duration <= 30 days, "OrahAccount: invalid duration");
        sessionKeys[key] = SessionKey({
            target:    target,
            selector:  selector,
            expiresAt: block.timestamp + duration,
            active:    true
        });
        emit SessionKeySet(key, target, selector, block.timestamp + duration);
    }

    function revokeSessionKey(address key) external onlyOwnerOrEntryPoint {
        sessionKeys[key].active = false;
        emit SessionKeyRevoked(key);
    }

    // ── Owner rotation (e.g. hardware wallet re-bind) ─────────────────────────
    function updateOwner(address newOwner) external onlyOwnerOrEntryPoint {
        require(newOwner != address(0), "OrahAccount: zero owner");
        emit OwnerUpdated(owner, newOwner);
        owner = newOwner;
    }

    // ── EntryPoint deposit helpers ────────────────────────────────────────────
    function addDeposit() external payable {
        IEntryPoint(ENTRY_POINT).depositTo{ value: msg.value }(address(this));
    }

    function withdrawDeposit(address payable to, uint256 amount) external onlyOwnerOrEntryPoint {
        IEntryPoint(ENTRY_POINT).withdrawTo(to, amount);
    }

    function getDeposit() external view returns (uint256) {
        return IEntryPoint(ENTRY_POINT).balanceOf(address(this));
    }

    function getNonce() external view returns (uint256) {
        return IEntryPoint(ENTRY_POINT).getNonce(address(this), 0);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Extract the selector from the inner `data` argument of an execute() call.
     * execute(address, uint256, bytes) → bytes is at offset 68 (4+32+32).
     */
    function _innerSelector(bytes calldata callData) internal pure returns (bytes4 sel) {
        // callData layout: 4 (execute selector) + 32 (target) + 32 (value) + 32 (data offset) + 32 (data length) + data
        // inner data starts at 4+32+32+32+32 = 132
        if (callData.length >= 136) {
            sel = bytes4(callData[132:136]);
        }
    }
}

// ── OrahAccountFactory ────────────────────────────────────────────────────────

contract OrahAccountFactory {
    // Minimal clone (ERC-1167 proxy) bytecode prefix / suffix
    bytes private constant PROXY_PREFIX =
        hex"363d3d373d3d3d363d73";
    bytes private constant PROXY_SUFFIX =
        hex"5af43d82803e903d91602b57fd5bf3";

    address public immutable implementation;
    address public immutable entryPoint;

    event AccountCreated(address indexed owner, address indexed account, uint256 salt);

    constructor() {
        OrahAccount impl = new OrahAccount();
        implementation = address(impl);
        entryPoint = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    }

    /**
     * Create (or return existing) OrahAccount for `owner` with deterministic salt.
     * Salt = keccak256(abi.encodePacked(owner, index)) so each owner can have
     * multiple accounts (index 0 = primary).
     */
    function createAccount(address owner, uint256 index) external returns (address account) {
        bytes32 salt = keccak256(abi.encodePacked(owner, index));
        address predicted = getAddress(owner, index);

        if (predicted.code.length > 0) return predicted;   // already deployed

        bytes memory initCode = _proxyBytecode(implementation);
        assembly {
            account := create2(0, add(initCode, 32), mload(initCode), salt)
        }
        require(account != address(0), "OrahAccountFactory: create2 failed");
        OrahAccount(payable(account)).initialize(owner);
        emit AccountCreated(owner, account, index);
    }

    /**
     * Compute the counterfactual address for `owner` + `index` without deploying.
     */
    function getAddress(address owner, uint256 index) public view returns (address) {
        bytes32 salt    = keccak256(abi.encodePacked(owner, index));
        bytes32 codeHash = keccak256(_proxyBytecode(implementation));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), salt, codeHash
        )))));
    }

    function _proxyBytecode(address impl) internal pure returns (bytes memory) {
        return abi.encodePacked(PROXY_PREFIX, impl, PROXY_SUFFIX);
    }
}
