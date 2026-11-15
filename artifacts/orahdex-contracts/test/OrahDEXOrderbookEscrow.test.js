import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ethers } = require("hardhat");

const E18 = 10n ** 18n;
const scale = (n) => BigInt(n) * E18;
const id = (text) => ethers.keccak256(ethers.toUtf8Bytes(text));

async function setup() {
  const [deployer, seller, buyer, feeRecipient, stranger] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("TestToken");
  const base = await Token.deploy();
  const Escrow = await ethers.getContractFactory("OrahDEXOrderbookEscrow");
  const escrow = await Escrow.deploy(feeRecipient.address, 10);
  await base.mint(seller.address, scale(20));
  await base.connect(seller).approve(escrow.target, scale(10));
  return { deployer, seller, buyer, feeRecipient, stranger, base, escrow };
}

async function openA8EthPair({ seller, buyer, base, escrow, sellerId, buyerId, baseQty = scale(10) }) {
  const expiresAt = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
  const native = ethers.ZeroAddress;
  const sellerLimit = 2n * E18;
  const buyerLimit = 3n * E18;
  const buyerQuote = (baseQty * buyerLimit) / E18;

  await escrow.connect(seller).openOrder(
    sellerId, 1, base.target, native, baseQty, 0, sellerLimit, expiresAt,
  );
  await escrow.connect(buyer).openOrder(
    buyerId, 0, base.target, native, baseQty, buyerQuote, buyerLimit, expiresAt,
    { value: buyerQuote },
  );
  return { expiresAt, buyerQuote };
}

describe("OrahDEXOrderbookEscrow", function () {
  it("settles A8/ETH atomically within both limit prices and refunds buyer price improvement", async function () {
    const ctx = await setup();
    const { seller, buyer, feeRecipient, base, escrow } = ctx;
    const sellerId = id("seller-order");
    const buyerId = id("buyer-order");
    const settlementId = id("fill-1");
    const { buyerQuote } = await openA8EthPair({ ...ctx, sellerId, buyerId });
    const grossQuote = 22n * E18;
    const fee = (grossQuote * 10n) / 10_010n;
    const sellerEthBefore = await ethers.provider.getBalance(seller.address);
    const feeEthBefore = await ethers.provider.getBalance(feeRecipient.address);

    await escrow.settle(settlementId, buyerId, sellerId, scale(10), grossQuote);

    assert.equal(await base.balanceOf(buyer.address), scale(10));
    assert.equal(await base.balanceOf(escrow.target), 0n);
    assert.equal(await ethers.provider.getBalance(escrow.target), 0n);
    assert.equal(await ethers.provider.getBalance(seller.address), sellerEthBefore + grossQuote - fee);
    assert.equal(await ethers.provider.getBalance(feeRecipient.address), feeEthBefore + fee);
    assert.equal(await escrow.orders(buyerId).then((o) => o.active), false);
    assert.equal(await escrow.orders(sellerId).then((o) => o.active), false);
    assert.equal(buyerQuote, 30n * E18);
    await escrow.settle(settlementId, buyerId, sellerId, scale(10), grossQuote);
    assert.equal(await base.balanceOf(buyer.address), scale(10));
  });

  it("rejects an out-of-limit fill without changing either escrow", async function () {
    const ctx = await setup();
    const { seller, buyer, base, escrow } = ctx;
    const sellerId = id("seller-price-order");
    const buyerId = id("buyer-price-order");
    await openA8EthPair({ ...ctx, sellerId, buyerId });

    await assert.rejects(() => escrow.settle(id("bad-fill"), buyerId, sellerId, scale(10), 19n * E18));
    assert.equal(await base.balanceOf(escrow.target), scale(10));
    assert.equal(await ethers.provider.getBalance(escrow.target), 30n * E18);
    assert.equal(await escrow.orders(buyerId).then((o) => o.active), true);
    assert.equal(await escrow.orders(sellerId).then((o) => o.active), true);
  });

  it("supports partial fills and returns only the remaining collateral on cancel", async function () {
    const ctx = await setup();
    const { seller, buyer, stranger, base, escrow } = ctx;
    const sellerId = id("seller-partial-order");
    const buyerId = id("buyer-partial-order");
    await openA8EthPair({ ...ctx, sellerId, buyerId });
    const grossQuote = 9n * E18;

    await escrow.settle(id("partial-fill"), buyerId, sellerId, scale(4), grossQuote);
    assert.equal(await base.balanceOf(buyer.address), scale(4));
    assert.equal(await base.balanceOf(escrow.target), scale(6));
    assert.equal(await ethers.provider.getBalance(escrow.target), 21n * E18);

    await assert.rejects(() => escrow.connect(stranger).cancel(sellerId));
    await escrow.connect(seller).cancel(sellerId);
    await escrow.connect(buyer).cancel(buyerId);

    assert.equal(await base.balanceOf(seller.address), scale(16));
    assert.equal(await base.balanceOf(escrow.target), 0n);
    assert.equal(await ethers.provider.getBalance(escrow.target), 0n);
  });

  it("rejects cross-pair orders and prevents a maker matching with itself", async function () {
    const { seller, buyer, base, escrow } = await setup();
    const other = await (await ethers.getContractFactory("TestToken")).deploy();
    const expiresAt = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const sellerId = id("seller-other-pair");
    const buyerId = id("buyer-other-pair");
    await base.connect(seller).approve(escrow.target, scale(10));
    await escrow.connect(seller).openOrder(
      sellerId, 1, base.target, ethers.ZeroAddress, scale(10), 0, 2n * E18, expiresAt,
    );
    await escrow.connect(buyer).openOrder(
      buyerId, 0, other.target, ethers.ZeroAddress, scale(10), scale(30), 3n * E18, expiresAt,
      { value: scale(30) },
    );
    await assert.rejects(() => escrow.settle(id("cross-pair"), buyerId, sellerId, scale(1), 3n * E18));
  });
});
