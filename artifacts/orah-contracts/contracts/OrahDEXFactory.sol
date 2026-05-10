// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OrahDEXPair.sol";

/**
 * @title OrahDEXFactory
 * @notice Deploys OrahDEXPair contracts and keeps a registry of all pools.
 *         Uses CREATE2 for deterministic pair addresses.
 */
contract OrahDEXFactory {
    address public feeTo;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex);

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /**
     * @notice Create a new AMM pair for two ERC-20 tokens.
     *         Tokens are sorted so token0 < token1 (by address).
     */
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "OrahDEXFactory: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "OrahDEXFactory: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "OrahDEXFactory: PAIR_EXISTS");

        bytes memory bytecode = type(OrahDEXPair).creationCode;
        bytes32 salt          = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        OrahDEXPair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate both directions
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "OrahDEXFactory: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "OrahDEXFactory: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }

    /**
     * @notice Returns the CREATE2 address for a pair without deploying it.
     */
    function pairFor(address tokenA, address tokenB) external view returns (address) {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        bytes32 hash = keccak256(
            abi.encodePacked(
                hex"ff",
                address(this),
                keccak256(abi.encodePacked(token0, token1)),
                keccak256(type(OrahDEXPair).creationCode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
