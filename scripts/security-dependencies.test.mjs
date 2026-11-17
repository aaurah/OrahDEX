import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";

const web = createRequire(new URL("../artifacts/bsv-dex/package.json", import.meta.url));
const api = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const mobile = createRequire(new URL("../artifacts/aura-dex-mobile/package.json", import.meta.url));
const child = (parent, name) => createRequire(parent.resolve(name));

test("Solana integer conversions use JavaScript, including oversized inputs", () => {
  const layout = child(web, "@solana/spl-token");
  const utils = child(layout, "@solana/buffer-layout-utils");
  const integers = utils("bigint-buffer");
  assert.equal(utils("bigint-buffer/package.json").name, "bigint-buffer-browser");
  for (const size of [0, 1, 8, 16, 32, 33, 64, 1024]) {
    const input = Buffer.alloc(size, 0x81);
    for (const endian of ["LE", "BE"]) {
      const value = integers[`toBigInt${endian}`](input);
      assert.equal(typeof value, "bigint");
      if (size) assert.deepEqual(integers[`toBuffer${endian}`](value, size), input);
      else assert.equal(value, 0n);
    }
  }
});

test("Expo deep merging cannot poison prototypes from either operand", () => {
  const config = child(child(mobile, "expo"), "@expo/config");
  const merge = config("deepmerge");
  assert.equal(config("deepmerge/package.json").name, "@shivammathur/deepmerge");
  const payload = JSON.parse('{"__proto__":{"admin":true},"nested":{"safe":1}}');
  for (const result of [
    merge({}, payload),
    merge(payload, {}),
    merge(Object.create(null), payload),
    merge.all([payload, { nested: { other: 2 } }]),
  ]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.admin, undefined);
    assert.equal(Object.hasOwn(result, "__proto__"), false);
    assert.equal(result.nested.safe, 1);
  }
  assert.deepEqual(merge({ a: [1] }, { a: [2] }), { a: [1, 2] });
});

test("RFC 6979 nonce truncation preserves leading zero octets on P-521", () => {
  const signing = child(child(web, "@ledgerhq/hw-app-eth"), "@ethersproject/transactions");
  const ellipticConsumer = child(signing, "@ethersproject/signing-key");
  const ellipticRequire = child(ellipticConsumer, "elliptic");
  const { ec: EC } = ellipticConsumer("elliptic");
  const DRBG = ellipticRequire("hmac-drbg");
  const BN = ellipticRequire("bn.js");
  const curve = new EC("p521");
  const generated = Buffer.alloc(66, 0x42);
  generated[0] = 0;
  const expectedK = new BN(generated).ushrn(7);
  const expected = curve.sign("abcd", "01", { k: () => expectedK });
  const original = DRBG.prototype.generate;
  try {
    DRBG.prototype.generate = () => Array.from(generated);
    const actual = curve.sign("abcd", "01");
    assert.equal(actual.toDER("hex"), expected.toDER("hex"));
    assert.equal(curve.verify("abcd", actual, curve.keyFromPrivate("01")), true);
  } finally {
    DRBG.prototype.generate = original;
  }
});

test("Ledger Ethereum signing retains compatible signatures and recovery", () => {
  const signing = child(child(web, "@ledgerhq/hw-app-eth"), "@ethersproject/transactions");
  const { SigningKey, recoverPublicKey } = signing("@ethersproject/signing-key");
  const key = new SigningKey(`0x${"01".padStart(64, "0")}`);
  const digest = `0x${"ab".repeat(32)}`;
  const signature = key.signDigest(digest);
  assert.equal(recoverPublicKey(digest, signature), key.publicKey);
});

test("Solana SDK and its JSON-RPC stream client load and parse responses", async () => {
  const solana = child(web, "@solana/web3.js");
  const { Keypair, Connection, Transaction, SystemProgram } = web("@solana/web3.js");
  const from = Keypair.generate();
  const to = Keypair.generate();
  const transaction = new Transaction({
    feePayer: from.publicKey,
    recentBlockhash: to.publicKey.toBase58(),
  }).add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to.publicKey, lamports: 1 }));
  transaction.sign(from);
  assert.equal(transaction.verifySignatures(), true);
  assert.ok(transaction.serialize().length);
  assert.equal(new Connection("https://api.mainnet-beta.solana.com").rpcEndpoint, "https://api.mainnet-beta.solana.com");
  const rpc = solana("jayson");
  const stream = new PassThrough();
  const result = new Promise((resolve, reject) => {
    rpc.utils.parseStream(stream, {}, (error, value) => error ? reject(error) : resolve(value));
  });
  stream.end('{"jsonrpc":"2.0","id":1,"result":42}\n');
  assert.deepEqual(await result, { jsonrpc: "2.0", id: 1, result: 42 });
});

test("Bitcoin address encoding and PSBT serialization remain compatible", () => {
  const bitcoin = web("bitcoinjs-lib");
  const address = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(`0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`, "hex"),
  }).address;
  assert.equal(address, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  const psbt = new bitcoin.Psbt()
    .addInput({
      hash: "11".repeat(32),
      index: 0,
      witnessUtxo: { script: bitcoin.address.toOutputScript(address), value: 2000 },
    })
    .addOutput({ address, value: 1000 });
  assert.equal(bitcoin.Psbt.fromBase64(psbt.toBase64()).txOutputs[0].value, 1000);
});

test("API middleware, mail transport, and schema validation initialize", () => {
  assert.equal(typeof api("compression")(), "function");
  const transport = api("nodemailer").createTransport({ jsonTransport: true });
  assert.equal(typeof transport.sendMail, "function");
  const { z } = web("zod");
  assert.deepEqual(z.object({ amount: z.number().positive() }).parse({ amount: 1 }), { amount: 1 });
  assert.equal(z.array(z.number()).max(2).safeParse([1, 2, 3]).success, false);
});
