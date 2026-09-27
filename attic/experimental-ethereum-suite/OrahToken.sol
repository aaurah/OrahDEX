// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * OrahToken (ORAH) — Native governance and utility token for OrahDEX
 *
 * ── TOKENOMICS ────────────────────────────────────────────────────────────────
 *   Total supply : 1,000,000,000 ORAH  (1 billion, all minted at deploy)
 *   Decimals     : 18
 *
 * ── FEE DISCOUNT TIERS ────────────────────────────────────────────────────────
 *   The OrahDEX backend (off-chain router) queries `feeDiscountBps()` to apply
 *   a trading fee discount based on the user's ORAH balance.
 *
 *   Tier 0 (default)  : hold < 1,000 ORAH  → 0 bps discount
 *   Tier 1 (Holder)   : hold ≥ 1,000 ORAH  → 1,000 bps (10%) discount
 *   Tier 2 (Pro)      : hold ≥ 10,000 ORAH → 2,500 bps (25%) discount
 *   Tier 3 (Elite)    : hold ≥ 100,000 ORAH → 5,000 bps (50%) discount
 *
 * ── STAKING ───────────────────────────────────────────────────────────────────
 *   Simple non-custodial staking: users lock ORAH for a configurable duration
 *   and earn staking points (accounted off-chain; no inflationary mint here).
 *   The contract emits Staked / Unstaked events which the OrahDEX indexer reads.
 *
 * ── GOVERNANCE ────────────────────────────────────────────────────────────────
 *   Owner can update fee discount thresholds and pause staking (not transfers).
 *   Ownership follows a 2-step transfer pattern for safety.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - No blacklist / freeze.
 *   - No mint after deploy.
 *   - Re-entrancy safe (state mutation before external call).
 *   - Integer overflow safe (Solidity 0.8.x built-in checks).
 */

// ── Minimal ERC-20 implementation (no external dependencies) ─────────────────

abstract contract ERC20 {
    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name   = _name;
        symbol = _symbol;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ORAH: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public virtual returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "ORAH: zero address");
        require(balanceOf[from] >= amount, "ORAH: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "ORAH: zero address");
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }
}

// ── Two-step ownership ────────────────────────────────────────────────────────

abstract contract Ownable {
    address public owner;
    address public pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address _owner) { owner = _owner; }

    modifier onlyOwner() { require(msg.sender == owner, "ORAH: not owner"); _; }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "ORAH: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }
}

// ── OrahToken ─────────────────────────────────────────────────────────────────

contract OrahToken is ERC20, Ownable {
    // ── Fee discount thresholds (in wei = ORAH * 1e18) ───────────────────────
    uint256 public tier1Threshold =   1_000e18;   // 1,000 ORAH  → 10% discount
    uint256 public tier2Threshold =  10_000e18;   // 10,000 ORAH → 25% discount
    uint256 public tier3Threshold = 100_000e18;   // 100,000 ORAH → 50% discount

    // ── Staking state ─────────────────────────────────────────────────────────
    struct StakePosition {
        uint256 amount;
        uint256 unlocksAt;   // unix timestamp
    }

    mapping(address => StakePosition[]) public stakePositions;
    uint256 public totalStaked;
    bool    public stakingPaused;

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount, uint256 duration, uint256 unlocksAt, uint256 positionIndex);
    event Unstaked(address indexed user, uint256 amount, uint256 positionIndex);
    event TiersUpdated(uint256 tier1, uint256 tier2, uint256 tier3);
    event StakingPaused(bool paused);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address treasury) ERC20("OrahDEX", "ORAH") Ownable(msg.sender) {
        _mint(treasury, 1_000_000_000e18);   // 1 billion ORAH → treasury
    }

    // ── Fee discount (read by OrahDEX backend) ────────────────────────────────

    /**
     * Returns the fee discount in basis points for `user`.
     * 10,000 bps = 100%.  OrahDEX applies: effectiveFee = baseFee * (10000 - discount) / 10000
     */
    function feeDiscountBps(address user) external view returns (uint256) {
        uint256 bal = balanceOf[user] + _stakedBalance(user);
        if (bal >= tier3Threshold) return 5_000;   // 50%
        if (bal >= tier2Threshold) return 2_500;   // 25%
        if (bal >= tier1Threshold) return 1_000;   // 10%
        return 0;
    }

    /**
     * Friendly tier label: "Elite" / "Pro" / "Holder" / "Standard"
     */
    function tierLabel(address user) external view returns (string memory) {
        uint256 bal = balanceOf[user] + _stakedBalance(user);
        if (bal >= tier3Threshold) return "Elite";
        if (bal >= tier2Threshold) return "Pro";
        if (bal >= tier1Threshold) return "Holder";
        return "Standard";
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    /**
     * Stake `amount` ORAH for `duration` seconds.
     * Creates a new locked position. Multiple positions per user are supported.
     */
    function stake(uint256 amount, uint256 duration) external {
        require(!stakingPaused, "ORAH: staking paused");
        require(amount > 0, "ORAH: zero amount");
        require(duration >= 7 days, "ORAH: min 7-day lock");
        require(duration <= 365 days, "ORAH: max 365-day lock");
        require(balanceOf[msg.sender] >= amount, "ORAH: insufficient balance");

        balanceOf[msg.sender] -= amount;
        totalStaked           += amount;

        uint256 unlocksAt = block.timestamp + duration;
        stakePositions[msg.sender].push(StakePosition({ amount: amount, unlocksAt: unlocksAt }));
        uint256 idx = stakePositions[msg.sender].length - 1;

        emit Staked(msg.sender, amount, duration, unlocksAt, idx);
    }

    /**
     * Unstake a specific position by index. Reverts if still locked.
     */
    function unstake(uint256 positionIndex) external {
        StakePosition[] storage positions = stakePositions[msg.sender];
        require(positionIndex < positions.length, "ORAH: invalid index");
        StakePosition storage pos = positions[positionIndex];
        require(pos.amount > 0, "ORAH: already unstaked");
        require(block.timestamp >= pos.unlocksAt, "ORAH: still locked");

        uint256 amount = pos.amount;
        pos.amount     = 0;
        totalStaked   -= amount;
        balanceOf[msg.sender] += amount;

        emit Unstaked(msg.sender, amount, positionIndex);
    }

    /**
     * Returns all stake positions for `user`.
     */
    function getStakePositions(address user) external view returns (StakePosition[] memory) {
        return stakePositions[user];
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setTierThresholds(uint256 t1, uint256 t2, uint256 t3) external onlyOwner {
        require(t1 < t2 && t2 < t3, "ORAH: must be ascending");
        tier1Threshold = t1;
        tier2Threshold = t2;
        tier3Threshold = t3;
        emit TiersUpdated(t1, t2, t3);
    }

    function setStakingPaused(bool paused) external onlyOwner {
        stakingPaused = paused;
        emit StakingPaused(paused);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _stakedBalance(address user) internal view returns (uint256 total) {
        StakePosition[] storage positions = stakePositions[user];
        for (uint256 i; i < positions.length; i++) {
            total += positions[i].amount;
        }
    }
}
