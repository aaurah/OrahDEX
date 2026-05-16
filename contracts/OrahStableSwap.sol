// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * OrahStableSwap — Curve-style StableSwap AMM for OrahDEX
 *
 * Implements the StableSwap invariant:
 *   A·n^n·∑xᵢ + D = A·D·n^n + D^(n+1) / (n^n · ∏xᵢ)
 *
 * Optimized for pegged-asset pairs (USDC/USDT, stETH/ETH, ORAH/xORAH).
 * Lower price impact than constant-product AMM for near-peg swaps.
 *
 * Supports 2-token pools only in this implementation (n=2).
 * Amplification parameter A controls curvature (higher A → more stable).
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract OrahStableSwap is ERC20, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────────────────────

    uint256 private constant N          = 2;
    uint256 private constant PRECISION  = 1e18;
    uint256 private constant FEE_DENOM  = 1e10;
    uint256 private constant MAX_A      = 1_000_000;
    uint256 private constant MAX_FEE    = 5e7;         // 0.5 %
    uint256 private constant MIN_RAMP   = 86_400;      // 1 day minimum ramp time

    // ── State ─────────────────────────────────────────────────────────────────

    IERC20[2] public tokens;
    uint256[2] public balances;        // pool reserves, scaled to 18 decimals
    uint256[2] public tokenDecimals;

    uint256 public fee;                // swap fee in FEE_DENOM units (e.g. 4e6 = 0.04%)
    uint256 public adminFee;           // fraction of swap fee sent to owner (in FEE_DENOM)

    uint256 public initialA;
    uint256 public futureA;
    uint256 public initialATime;
    uint256 public futureATime;

    // ── Events ────────────────────────────────────────────────────────────────

    event TokenSwap(
        address indexed buyer,
        uint256 tokensSold,
        uint256 tokensBought,
        uint128 soldId,
        uint128 boughtId
    );
    event AddLiquidity(
        address indexed provider,
        uint256[2] tokenAmounts,
        uint256[2] fees,
        uint256 invariant,
        uint256 lpSupply
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256[2] tokenAmounts,
        uint256 lpSupply
    );
    event RemoveLiquidityImbalance(
        address indexed provider,
        uint256[2] tokenAmounts,
        uint256[2] fees,
        uint256 invariant,
        uint256 lpSupply
    );
    event RampA(uint256 oldA, uint256 newA, uint256 initialTime, uint256 futureTime);
    event StopRampA(uint256 currentA, uint256 time);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address[2] memory _tokens,
        uint256[2] memory _decimals,
        uint256           _A,
        uint256           _fee,
        uint256           _adminFee,
        string memory     _name,
        string memory     _symbol
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_A > 0 && _A <= MAX_A, "OrahStableSwap: A out of range");
        require(_fee <= MAX_FEE,       "OrahStableSwap: fee too high");
        require(_adminFee <= FEE_DENOM,"OrahStableSwap: adminFee too high");

        for (uint256 i = 0; i < N; i++) {
            require(_tokens[i] != address(0), "OrahStableSwap: zero token");
            require(_decimals[i] <= 18,       "OrahStableSwap: decimals > 18");
            tokens[i]       = IERC20(_tokens[i]);
            tokenDecimals[i] = _decimals[i];
        }

        initialA    = _A * PRECISION;
        futureA     = _A * PRECISION;
        fee         = _fee;
        adminFee    = _adminFee;
    }

    // ── Amplification parameter ──────────────────────────────────────────────

    function getA() public view returns (uint256) {
        uint256 t1 = futureATime;
        uint256 A1 = futureA;
        if (block.timestamp < t1) {
            uint256 A0 = initialA;
            uint256 t0 = initialATime;
            if (A1 > A0) {
                return A0 + (A1 - A0) * (block.timestamp - t0) / (t1 - t0);
            } else {
                return A0 - (A0 - A1) * (block.timestamp - t0) / (t1 - t0);
            }
        }
        return A1;
    }

    // ── D invariant ──────────────────────────────────────────────────────────

    function getD(uint256[2] memory xp, uint256 amp) internal pure returns (uint256) {
        uint256 S = xp[0] + xp[1];
        if (S == 0) return 0;

        uint256 Dprev;
        uint256 D = S;
        uint256 Ann = amp * N;

        for (uint256 i = 0; i < 255; i++) {
            uint256 DP = D * D / xp[0] * D / xp[1] / (N ** N);
            Dprev = D;
            D = (Ann * S / PRECISION + DP * N) * D / ((Ann - PRECISION) * D / PRECISION + (N + 1) * DP);
            if (D > Dprev && D - Dprev <= 1) break;
            if (D <= Dprev && Dprev - D <= 1) break;
        }
        return D;
    }

    function _xp() internal view returns (uint256[2] memory) {
        return [
            balances[0] * (10 ** (18 - tokenDecimals[0])),
            balances[1] * (10 ** (18 - tokenDecimals[1]))
        ];
    }

    // ── Swap ──────────────────────────────────────────────────────────────────

    function getY(
        uint256 i,
        uint256 j,
        uint256 x,
        uint256[2] memory xp_
    ) internal view returns (uint256) {
        uint256 amp = getA();
        uint256 D   = getD(xp_, amp);
        uint256 Ann = amp * N;

        uint256 c  = D;
        uint256 S_ = 0;

        for (uint256 k = 0; k < N; k++) {
            uint256 _x;
            if (k == i)      { _x = x; }
            else if (k != j) { _x = xp_[k]; }
            else              { continue; }
            S_ += _x;
            c = c * D / (_x * N);
        }
        c = c * D * PRECISION / (Ann * N);
        uint256 b = S_ + D * PRECISION / Ann;

        uint256 y = D;
        for (uint256 k = 0; k < 255; k++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - D);
            if (y > yPrev && y - yPrev <= 1) break;
            if (y <= yPrev && yPrev - y <= 1) break;
        }
        return y;
    }

    function getDy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256) {
        uint256[2] memory xp = _xp();
        uint256 x  = xp[i] + dx * (10 ** (18 - tokenDecimals[i]));
        uint256 y  = getY(i, j, x, xp);
        uint256 dy = (xp[j] - y - 1) / (10 ** (18 - tokenDecimals[j]));
        uint256 _fee = dy * fee / FEE_DENOM;
        return dy - _fee;
    }

    function swap(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 minDy,
        address recipient
    ) external nonReentrant returns (uint256) {
        require(i != j,      "OrahStableSwap: same token");
        require(i < N && j < N, "OrahStableSwap: index out of range");

        tokens[i].safeTransferFrom(msg.sender, address(this), dx);

        uint256[2] memory xp   = _xp();
        uint256 x  = xp[i] + dx * (10 ** (18 - tokenDecimals[i]));
        uint256 y  = getY(i, j, x, xp);

        uint256 dy     = xp[j] - y - 1;
        uint256 dyFee  = dy * fee / FEE_DENOM;
        dy             = (dy - dyFee) / (10 ** (18 - tokenDecimals[j]));

        require(dy >= minDy, "OrahStableSwap: slippage");

        balances[i] += dx;
        balances[j] -= dy + dyFee / (10 ** (18 - tokenDecimals[j]));

        tokens[j].safeTransfer(recipient, dy);

        emit TokenSwap(msg.sender, dx, dy, uint128(i), uint128(j));
        return dy;
    }

    // ── Liquidity ─────────────────────────────────────────────────────────────

    function addLiquidity(
        uint256[2] calldata amounts,
        uint256 minMintAmount,
        address recipient
    ) external nonReentrant returns (uint256) {
        uint256 amp = getA();
        uint256[2] memory oldBalances = balances;
        uint256 D0 = totalSupply() > 0 ? getD(_xp(), amp) : 0;

        uint256[2] memory newBalances = [oldBalances[0] + amounts[0], oldBalances[1] + amounts[1]];
        balances = newBalances;

        uint256 D1 = getD(_xp(), amp);
        require(D1 > D0, "OrahStableSwap: D not increasing");

        uint256 totalSupply_ = totalSupply();
        uint256[2] memory fees;
        uint256 mintAmount;

        if (totalSupply_ > 0) {
            uint256 feeRate = fee * N / (4 * (N - 1));
            for (uint256 i = 0; i < N; i++) {
                uint256 ideal = D1 * oldBalances[i] / D0;
                uint256 diff  = ideal > newBalances[i]
                    ? ideal - newBalances[i]
                    : newBalances[i] - ideal;
                fees[i] = feeRate * diff / FEE_DENOM;
                balances[i] = newBalances[i] - fees[i] * adminFee / FEE_DENOM;
                newBalances[i] -= fees[i];
            }
            uint256 D2 = getD(_xp(), amp);
            mintAmount = totalSupply_ * (D2 - D0) / D0;
        } else {
            for (uint256 i = 0; i < N; i++) {
                tokens[i].safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
            mintAmount = D1;
        }

        require(mintAmount >= minMintAmount, "OrahStableSwap: min LP not met");

        if (totalSupply_ > 0) {
            for (uint256 i = 0; i < N; i++) {
                tokens[i].safeTransferFrom(msg.sender, address(this), amounts[i]);
            }
        }

        _mint(recipient, mintAmount);
        emit AddLiquidity(msg.sender, amounts, fees, D1, totalSupply());
        return mintAmount;
    }

    function removeLiquidity(
        uint256 lpAmount,
        uint256[2] calldata minAmounts,
        address recipient
    ) external nonReentrant returns (uint256[2] memory) {
        uint256 totalSupply_ = totalSupply();
        uint256[2] memory amounts;
        for (uint256 i = 0; i < N; i++) {
            amounts[i] = balances[i] * lpAmount / totalSupply_;
            require(amounts[i] >= minAmounts[i], "OrahStableSwap: slippage");
            balances[i] -= amounts[i];
            tokens[i].safeTransfer(recipient, amounts[i]);
        }
        _burn(msg.sender, lpAmount);
        emit RemoveLiquidity(msg.sender, amounts, totalSupply());
        return amounts;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function rampA(uint256 _futureA, uint256 _futureTime) external onlyOwner {
        require(_futureTime >= block.timestamp + MIN_RAMP, "OrahStableSwap: ramp too fast");
        require(_futureA > 0 && _futureA <= MAX_A,        "OrahStableSwap: A out of range");
        uint256 current = getA();
        require(
            (_futureA * PRECISION > current ? _futureA * PRECISION / current : current / (_futureA * PRECISION)) <= 10,
            "OrahStableSwap: rate too fast"
        );
        initialA    = current;
        futureA     = _futureA * PRECISION;
        initialATime = block.timestamp;
        futureATime  = _futureTime;
        emit RampA(current, _futureA * PRECISION, block.timestamp, _futureTime);
    }

    function stopRampA() external onlyOwner {
        uint256 current = getA();
        initialA    = current;
        futureA     = current;
        initialATime = block.timestamp;
        futureATime  = block.timestamp;
        emit StopRampA(current, block.timestamp);
    }
}
