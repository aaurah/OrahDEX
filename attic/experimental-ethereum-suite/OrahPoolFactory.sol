// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * OrahPoolFactory — Unified pool creation registry for OrahDEX
 *
 * Supports two pool types:
 *   - CONSTANT_PRODUCT: classic x·y=k AMM (OrahPair via minimal CREATE2 clone)
 *   - STABLE_SWAP:      Curve-style StableSwap (OrahStableSwap)
 *
 * Any address can create a pool by calling `createPool()`.
 * A 0.05 % protocol fee is collected on all pools to the `feeTo` address.
 * Pool addresses are deterministic (CREATE2) given (tokenA, tokenB, poolType).
 */

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ── Minimal proxy (EIP-1167) interface ──────────────────────────────────────

interface IOrahPair {
    function initialize(address tokenA, address tokenB, address factory) external;
}

interface IOrahStableSwap {
    function initialize(
        address[2] calldata tokens,
        uint256[2] calldata decimals,
        uint256 A,
        uint256 fee,
        uint256 adminFee
    ) external;
}

// ── Factory ──────────────────────────────────────────────────────────────────

contract OrahPoolFactory is Ownable2Step {

    // ── Pool types ───────────────────────────────────────────────────────────

    enum PoolType { CONSTANT_PRODUCT, STABLE_SWAP }

    // ── Pool record ──────────────────────────────────────────────────────────

    struct PoolInfo {
        address pool;
        address token0;
        address token1;
        PoolType poolType;
        uint256 feeBps;         // e.g. 30 = 0.30%
        uint256 amplification;  // for StableSwap; 0 for constant-product
        uint256 createdAt;
        address creator;
    }

    // ── State ─────────────────────────────────────────────────────────────────

    address public cpmmImplementation;        // constant-product pool template
    address public stableSwapImplementation;  // StableSwap template
    address public feeTo;                     // protocol fee recipient

    mapping(address => mapping(address => mapping(PoolType => address))) public getPool;
    PoolInfo[] public allPools;

    // ── Events ────────────────────────────────────────────────────────────────

    event PoolCreated(
        address indexed token0,
        address indexed token1,
        PoolType indexed poolType,
        address pool,
        uint256 feeBps,
        uint256 amplification,
        uint256 poolIndex
    );
    event FeeToUpdated(address indexed oldFeeTo, address indexed newFeeTo);
    event ImplementationUpdated(PoolType indexed poolType, address indexed impl);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _cpmmImpl,
        address _stableSwapImpl,
        address _feeTo
    ) Ownable(msg.sender) {
        require(_cpmmImpl       != address(0), "OrahPoolFactory: zero cpmmImpl");
        require(_stableSwapImpl != address(0), "OrahPoolFactory: zero stableImpl");
        require(_feeTo          != address(0), "OrahPoolFactory: zero feeTo");
        cpmmImplementation       = _cpmmImpl;
        stableSwapImplementation = _stableSwapImpl;
        feeTo                    = _feeTo;
    }

    // ── Pool creation ─────────────────────────────────────────────────────────

    /**
     * Create a constant-product (x·y=k) pool.
     * Canonical ordering: token0 < token1 (by address sort).
     * @param tokenA       First token (any order)
     * @param tokenB       Second token
     * @param feeBps       Swap fee in basis points (e.g. 30 = 0.30%)
     */
    function createConstantProductPool(
        address tokenA,
        address tokenB,
        uint256 feeBps
    ) external returns (address pool) {
        require(tokenA != tokenB,         "OrahPoolFactory: identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "OrahPoolFactory: zero token");
        require(feeBps <= 1000,           "OrahPoolFactory: fee > 10%");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(
            getPool[token0][token1][PoolType.CONSTANT_PRODUCT] == address(0),
            "OrahPoolFactory: pool exists"
        );

        bytes32 salt = keccak256(abi.encodePacked(token0, token1, PoolType.CONSTANT_PRODUCT));
        pool = _deployMinimalProxy(cpmmImplementation, salt);

        IOrahPair(pool).initialize(token0, token1, address(this));

        getPool[token0][token1][PoolType.CONSTANT_PRODUCT] = pool;
        getPool[token1][token0][PoolType.CONSTANT_PRODUCT] = pool;

        allPools.push(PoolInfo({
            pool:          pool,
            token0:        token0,
            token1:        token1,
            poolType:      PoolType.CONSTANT_PRODUCT,
            feeBps:        feeBps,
            amplification: 0,
            createdAt:     block.timestamp,
            creator:       msg.sender,
        }));

        emit PoolCreated(token0, token1, PoolType.CONSTANT_PRODUCT, pool, feeBps, 0, allPools.length - 1);
    }

    /**
     * Create a StableSwap pool for pegged assets.
     * @param tokenA       First token
     * @param tokenB       Second token
     * @param amplification  A parameter (e.g. 100–2000 for stablecoins)
     * @param feeBps       Swap fee in basis points (e.g. 4 = 0.04%)
     */
    function createStableSwapPool(
        address tokenA,
        address tokenB,
        uint256 amplification,
        uint256 feeBps
    ) external returns (address pool) {
        require(tokenA != tokenB,         "OrahPoolFactory: identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "OrahPoolFactory: zero token");
        require(amplification > 0 && amplification <= 1_000_000, "OrahPoolFactory: A out of range");
        require(feeBps <= 100,            "OrahPoolFactory: stable fee > 1%");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(
            getPool[token0][token1][PoolType.STABLE_SWAP] == address(0),
            "OrahPoolFactory: stable pool exists"
        );

        uint256 decimals0 = _getDecimals(token0);
        uint256 decimals1 = _getDecimals(token1);

        bytes32 salt = keccak256(abi.encodePacked(token0, token1, PoolType.STABLE_SWAP, amplification));
        pool = _deployMinimalProxy(stableSwapImplementation, salt);

        IOrahStableSwap(pool).initialize(
            [token0, token1],
            [decimals0, decimals1],
            amplification,
            feeBps * 1e8,    // convert bps to FEE_DENOM scale (1e10)
            5e9              // 50% of fee goes to protocol
        );

        getPool[token0][token1][PoolType.STABLE_SWAP] = pool;
        getPool[token1][token0][PoolType.STABLE_SWAP] = pool;

        allPools.push(PoolInfo({
            pool:          pool,
            token0:        token0,
            token1:        token1,
            poolType:      PoolType.STABLE_SWAP,
            feeBps:        feeBps,
            amplification: amplification,
            createdAt:     block.timestamp,
            creator:       msg.sender,
        }));

        emit PoolCreated(token0, token1, PoolType.STABLE_SWAP, pool, feeBps, amplification, allPools.length - 1);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    function getPoolInfo(uint256 index) external view returns (PoolInfo memory) {
        return allPools[index];
    }

    function getPools(uint256 from, uint256 to) external view returns (PoolInfo[] memory) {
        require(to <= allPools.length, "OrahPoolFactory: out of range");
        PoolInfo[] memory result = new PoolInfo[](to - from);
        for (uint256 i = from; i < to; i++) {
            result[i - from] = allPools[i];
        }
        return result;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), "OrahPoolFactory: zero feeTo");
        emit FeeToUpdated(feeTo, _feeTo);
        feeTo = _feeTo;
    }

    function setImplementation(PoolType poolType, address impl) external onlyOwner {
        require(impl != address(0), "OrahPoolFactory: zero impl");
        if (poolType == PoolType.CONSTANT_PRODUCT) {
            cpmmImplementation = impl;
        } else {
            stableSwapImplementation = impl;
        }
        emit ImplementationUpdated(poolType, impl);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _deployMinimalProxy(address impl, bytes32 salt) internal returns (address proxy) {
        // EIP-1167 minimal proxy bytecode
        bytes memory bytecode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            impl,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
        proxy = Create2.deploy(0, salt, bytecode);
    }

    function _getDecimals(address token) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (ok && data.length == 32) return abi.decode(data, (uint8));
        return 18;
    }
}
