// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title OrahDEXOrderbookEscrow
 * @notice Self-custody order escrow with atomic, price-bounded EVM fills.
 *
 * Makers lock the spend asset when opening an order. Anyone may settle a
 * compatible buy/sell pair, but the contract fixes recipients to the order
 * makers and checks both signed-on-chain price limits before moving funds.
 * A fill and both asset transfers occur in one transaction or all revert.
 *
 * limitPriceX18 is quote smallest-units per base smallest-unit, scaled by 1e18.
 * The client must account for each token's decimals when encoding it.
 */
contract OrahDEXOrderbookEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PRICE_SCALE = 1e18;
    uint16 public immutable feeBps;
    address public immutable feeRecipient;

    enum Side {
        Buy,
        Sell
    }

    struct Order {
        address maker;
        address baseToken;  // address(0) means native coin
        address quoteToken; // address(0) means native coin
        uint256 originalBaseAmount;
        uint256 remainingBaseAmount;
        uint256 remainingEscrowAmount;
        uint256 limitPriceX18;
        uint64 expiresAt;
        Side side;
        bool active;
    }

    mapping(bytes32 => Order) public orders;

    event OrderOpened(
        bytes32 indexed orderId,
        address indexed maker,
        Side side,
        address baseToken,
        address quoteToken,
        uint256 baseAmount,
        uint256 escrowAmount,
        uint256 limitPriceX18,
        uint64 expiresAt
    );
    event OrderSettled(
        bytes32 indexed buyOrderId,
        bytes32 indexed sellOrderId,
        address buyer,
        address seller,
        uint256 baseAmount,
        uint256 grossQuoteAmount,
        uint256 feeAmount
    );
    event OrderCancelled(bytes32 indexed orderId, address indexed maker, uint256 refundAmount);

    error InvalidOrder();
    error InvalidFill();
    error Unauthorized();
    error OrderUnavailable();
    error PriceNotCrossed();
    error InsufficientEscrow();
    error IncorrectValue();
    error UnsupportedTokenTransfer();
    error TransferFailed();

    constructor(address feeRecipient_, uint16 feeBps_) {
        if (feeBps_ > 200 || (feeBps_ > 0 && feeRecipient_ == address(0))) {
            revert InvalidOrder();
        }
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    /**
     * @notice Open and collateralize a limit order in one wallet transaction.
     * Buy orders lock quoteAmount; sell orders lock baseAmount.
     * Sell orders must pass quoteAmount = 0.
     */
    function openOrder(
        bytes32 orderId,
        Side side,
        address baseToken,
        address quoteToken,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 limitPriceX18,
        uint64 expiresAt
    ) external payable nonReentrant {
        if (
            orderId == bytes32(0) ||
            baseToken == quoteToken ||
            baseAmount == 0 ||
            limitPriceX18 == 0 ||
            expiresAt <= block.timestamp ||
            expiresAt > block.timestamp + 30 days ||
            orders[orderId].maker != address(0)
        ) revert InvalidOrder();

        uint256 escrowAmount;
        address escrowToken;
        if (side == Side.Buy) {
            if (quoteAmount == 0) revert InvalidOrder();
            uint256 minQuote = Math.mulDiv(baseAmount, limitPriceX18, PRICE_SCALE);
            if (mulmod(baseAmount, limitPriceX18, PRICE_SCALE) != 0) minQuote += 1;
            if (quoteAmount < minQuote) revert InvalidOrder();
            escrowAmount = quoteAmount;
            escrowToken = quoteToken;
        } else {
            if (quoteAmount != 0) revert InvalidOrder();
            escrowAmount = baseAmount;
            escrowToken = baseToken;
        }

        _receiveExact(escrowToken, escrowAmount);

        orders[orderId] = Order({
            maker: msg.sender,
            baseToken: baseToken,
            quoteToken: quoteToken,
            originalBaseAmount: baseAmount,
            remainingBaseAmount: baseAmount,
            remainingEscrowAmount: escrowAmount,
            limitPriceX18: limitPriceX18,
            expiresAt: expiresAt,
            side: side,
            active: true
        });

        emit OrderOpened(
            orderId, msg.sender, side, baseToken, quoteToken,
            baseAmount, escrowAmount, limitPriceX18, expiresAt
        );
    }

    /**
     * @notice Fill a buy and sell order atomically at gross quote amount.
     * The fee is deducted from gross quote; the seller receives net quote.
     * Any failed validation or transfer reverts both legs and fill accounting.
     */
    function settle(
        bytes32 buyOrderId,
        bytes32 sellOrderId,
        uint256 baseAmount,
        uint256 grossQuoteAmount
    ) external nonReentrant {
        if (baseAmount == 0 || grossQuoteAmount == 0) revert InvalidFill();

        Order storage buy = orders[buyOrderId];
        Order storage sell = orders[sellOrderId];
        if (
            !buy.active || !sell.active ||
            buy.side != Side.Buy || sell.side != Side.Sell ||
            buy.maker == sell.maker ||
            buy.baseToken != sell.baseToken ||
            buy.quoteToken != sell.quoteToken ||
            block.timestamp >= buy.expiresAt ||
            block.timestamp >= sell.expiresAt
        ) revert OrderUnavailable();

        if (
            baseAmount > buy.remainingBaseAmount ||
            baseAmount > sell.remainingBaseAmount ||
            grossQuoteAmount > buy.remainingEscrowAmount
        ) revert InsufficientEscrow();

        uint256 feeAmount = feeBps == 0
            ? 0
            : Math.mulDiv(grossQuoteAmount, feeBps, 10_000 + feeBps);
        uint256 netQuoteAmount = grossQuoteAmount - feeAmount;

        uint256 buyerMaxQuote = Math.mulDiv(baseAmount, buy.limitPriceX18, PRICE_SCALE);
        uint256 sellerMinQuote = Math.mulDiv(baseAmount, sell.limitPriceX18, PRICE_SCALE);
        if (mulmod(baseAmount, sell.limitPriceX18, PRICE_SCALE) != 0) sellerMinQuote += 1;
        if (grossQuoteAmount > buyerMaxQuote || netQuoteAmount < sellerMinQuote) {
            revert PriceNotCrossed();
        }

        buy.remainingBaseAmount -= baseAmount;
        buy.remainingEscrowAmount -= grossQuoteAmount;
        sell.remainingBaseAmount -= baseAmount;
        sell.remainingEscrowAmount -= baseAmount;

        address buyer = buy.maker;
        address seller = sell.maker;

        if (buy.remainingBaseAmount == 0) {
            buy.active = false;
            _refundRemainder(buy);
        }
        if (sell.remainingBaseAmount == 0) {
            sell.active = false;
            _refundRemainder(sell);
        }

        _sendExact(sell.baseToken, buyer, baseAmount);
        _sendExact(buy.quoteToken, seller, netQuoteAmount);
        if (feeAmount > 0) _sendExact(buy.quoteToken, feeRecipient, feeAmount);

        emit OrderSettled(
            buyOrderId, sellOrderId, buyer, seller,
            baseAmount, grossQuoteAmount, feeAmount
        );
    }

    /**
     * @notice Cancel an open order and return its unfilled escrow to its maker.
     * The filled portion cannot be refunded. Anyone may trigger expiry cleanup,
     * but the refund always goes to the original maker.
     */
    function cancel(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.maker == address(0) || !order.active) revert OrderUnavailable();
        if (msg.sender != order.maker && block.timestamp < order.expiresAt) {
            revert Unauthorized();
        }

        order.active = false;
        uint256 refundAmount = order.remainingEscrowAmount;
        order.remainingEscrowAmount = 0;
        _sendExact(_escrowToken(order), order.maker, refundAmount);
        emit OrderCancelled(orderId, order.maker, refundAmount);
    }

    function _escrowToken(Order storage order) private view returns (address) {
        return order.side == Side.Buy ? order.quoteToken : order.baseToken;
    }

    function _refundRemainder(Order storage order) private {
        uint256 amount = order.remainingEscrowAmount;
        if (amount == 0) return;
        order.remainingEscrowAmount = 0;
        _sendExact(_escrowToken(order), order.maker, amount);
    }

    function _receiveExact(address token, uint256 amount) private {
        if (token == address(0)) {
            if (msg.value != amount) revert IncorrectValue();
            return;
        }
        if (msg.value != 0 || token.code.length == 0) revert IncorrectValue();
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - beforeBalance != amount) {
            revert UnsupportedTokenTransfer();
        }
    }

    function _sendExact(address token, address recipient, uint256 amount) private {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed();
            return;
        }
        uint256 beforeBalance = IERC20(token).balanceOf(recipient);
        IERC20(token).safeTransfer(recipient, amount);
        if (IERC20(token).balanceOf(recipient) - beforeBalance != amount) {
            revert UnsupportedTokenTransfer();
        }
    }
}
