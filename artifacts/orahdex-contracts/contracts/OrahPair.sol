// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OrahPair
 * @notice AMM liquidity pool (x·y = k) with ERC-20 LP tokens.
 *         Based on Uniswap V2 Core — LP tokens are real ERC-20s visible in
 *         MetaMask, Rabby, and any wallet that reads balanceOf.
 *
 * Deployed by OrahFactory. Never deploy directly.
 */
contract OrahPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;
    address public constant DEAD              = 0x000000000000000000000000000000000000dEaD;

    address public factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32  private blockTimestampLast;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC20("OrahDEX LP Token", "ORAH-LP") {
        factory = msg.sender;
    }

    /**
     * @notice Called once by the factory to initialise token addresses.
     */
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "OrahPair: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    // ─── ERC-20 overrides: descriptive name ───────────────────────────────────

    function name() public view override returns (string memory) {
        string memory s0 = _truncate(token0);
        string memory s1 = _truncate(token1);
        return string(abi.encodePacked("OrahDEX LP: ", s0, "/", s1));
    }

    function symbol() public view override returns (string memory) {
        return "ORAH-LP";
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    // ─── Reserve view ─────────────────────────────────────────────────────────

    function getReserves()
        public view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0          = reserve0;
        _reserve1          = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    // ─── Core AMM ─────────────────────────────────────────────────────────────

    /**
     * @notice Mint LP tokens. Call after transferring token0 + token1 to this contract.
     * @param to Recipient of LP tokens.
     */
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0  = balance0 - _reserve0;
        uint256 amount1  = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(DEAD, MINIMUM_LIQUIDITY); // permanently lock minimum liquidity
        } else {
            liquidity = _min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "OrahPair: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /**
     * @notice Burn LP tokens. Call after transferring LP tokens to this contract.
     * @param to Recipient of the underlying tokens.
     */
    function burn(address to)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;

        uint256 balance0   = IERC20(_token0).balanceOf(address(this));
        uint256 balance1   = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity  = balanceOf(address(this));
        uint256 _totalSupply = totalSupply();

        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "OrahPair: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);
        IERC20(_token0).safeTransfer(to, amount0);
        IERC20(_token1).safeTransfer(to, amount1);

        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /**
     * @notice Execute a swap. Exactly one of amount0Out / amount1Out must be > 0.
     *         Caller must ensure that the appropriate input has been transferred
     *         to this contract before calling (checked via the k invariant).
     */
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata /*data*/
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "OrahPair: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "OrahPair: INSUFFICIENT_LIQUIDITY");

        require(to != token0 && to != token1, "OrahPair: INVALID_TO");

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "OrahPair: INSUFFICIENT_INPUT_AMOUNT");

        // k invariant check with 0.3% fee (997/1000)
        uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
        uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
        require(
            balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1) * 1000 * 1000,
            "OrahPair: K"
        );

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /**
     * @notice Force-sync reserves to current balances.
     */
    function sync() external nonReentrant {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 /*_reserve0*/,
        uint112 /*_reserve1*/
    ) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "OrahPair: OVERFLOW");
        reserve0           = uint112(balance0);
        reserve1           = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2**32);
        emit Sync(reserve0, reserve1);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) {
            z = 1;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _truncate(address token) private pure returns (string memory) {
        bytes memory b = abi.encodePacked(token);
        bytes memory result = new bytes(8);
        bytes16 hex_chars = "0123456789abcdef";
        result[0] = "0"; result[1] = "x";
        result[2] = hex_chars[uint8(b[0]) >> 4];
        result[3] = hex_chars[uint8(b[0]) & 0x0f];
        result[4] = hex_chars[uint8(b[1]) >> 4];
        result[5] = hex_chars[uint8(b[1]) & 0x0f];
        result[6] = hex_chars[uint8(b[2]) >> 4];
        result[7] = hex_chars[uint8(b[2]) & 0x0f];
        return string(result);
    }
}
