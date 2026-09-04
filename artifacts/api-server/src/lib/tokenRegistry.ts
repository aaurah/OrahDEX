/**
 * tokenRegistry.ts — Shared ERC-20 token registry for OrahDEX
 *
 * Provides a canonical mapping of symbol → { chainId → contractAddress, decimals }
 * used by both trade.ts (Transfer-log verification) and fundingVerifier.ts
 * (on-chain ERC-20 balance checks via readContract).
 *
 * Native chain assets (ETH, BNB, MATIC, AVAX) are identified by the
 * NATIVE_SYMBOLS map; they use `client.getBalance()` rather than `balanceOf`.
 *
 * To add a new token: add its entry in TOKEN_REGISTRY for each supported chain.
 * To add a new chain: add its native symbol to NATIVE_SYMBOLS and entries to TOKEN_REGISTRY.
 *
 * Unknown tokens fall back to signature-only proof in fundingVerifier — this
 * registry provides full on-chain balance verification for listed tokens.
 */

export interface TokenInfo {
  /** Checksummed or lowercase ERC-20 contract address */
  address:  string;
  /** Token decimals (e.g. 6 for USDT, 18 for WETH, 8 for WBTC) */
  decimals: number;
}

/**
 * TOKEN_REGISTRY[chainId][SYMBOL_UPPERCASE] → TokenInfo
 *
 * Only covers ERC-20 tokens. Native assets (ETH, BNB, MATIC, AVAX)
 * are NOT listed here — use NATIVE_SYMBOLS to identify them.
 */
export const TOKEN_REGISTRY: Record<number, Record<string, TokenInfo>> = {
  // ─── Ethereum Mainnet ────────────────────────────────────────────────────────
  1: {
    // Stablecoins
    USDT:   { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6  },
    USDC:   { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6  },
    DAI:    { address: "0x6b175474e89094c44da98b954eedeac495271d0f", decimals: 18 },
    FRAX:   { address: "0x853d955acef822db058eb8505911ed77f175b99e", decimals: 18 },
    TUSD:   { address: "0x0000000000085d4780b73119b644ae5ecd22b376", decimals: 18 },
    LUSD:   { address: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0", decimals: 18 },
    USDP:   { address: "0x8e870d67f660d95d5be530380d0ec0bd388289e1", decimals: 18 },
    // Wrapped assets
    WETH:   { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", decimals: 18 },
    WBTC:   { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", decimals: 8  },
    WSTETH: { address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", decimals: 18 },
    STETH:  { address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", decimals: 18 },
    RETH:   { address: "0xae78736cd615f374d3085123a210448e74fc6393", decimals: 18 },
    CBETH:  { address: "0xbe9895146f7af43049ca1c1ae358b0541ea49704", decimals: 18 },
    WSOL:   { address: "0xd31a59c85ae9d8edefec411d448f90841571b89c", decimals: 9  },
    // DeFi blue-chips
    LINK:   { address: "0x514910771af9ca656af840dff83e8264ecf986ca", decimals: 18 },
    UNI:    { address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18 },
    AAVE:   { address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", decimals: 18 },
    MKR:    { address: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", decimals: 18 },
    SNX:    { address: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", decimals: 18 },
    COMP:   { address: "0xc00e94cb662c3520282e6f5717214004a7f26888", decimals: 18 },
    CRV:    { address: "0xd533a949740bb3306d119cc777fa900ba034cd52", decimals: 18 },
    BAL:    { address: "0xba100000625a3754423978a60c9317c58a424e3d", decimals: 18 },
    YFI:    { address: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", decimals: 18 },
    SUSHI:  { address: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2", decimals: 18 },
    "1INCH":{ address: "0x111111111117dc0aa78b770fa6a738034120c302", decimals: 18 },
    GRT:    { address: "0xc944e90c64b2c07662a292be6244bdf05cda44a7", decimals: 18 },
    LDO:    { address: "0x5a98fcbea516cf06857215779fd812ca3bef1b32", decimals: 18 },
    RPL:    { address: "0xd33526068d116ce69f19a9ee46f0bd304f21a51f", decimals: 18 },
    DYDX:   { address: "0x92d6c1e31e14520e676a687f0a93788b716beff5", decimals: 18 },
    LRC:    { address: "0xbbbbca6a901c926f240b89eacb641d8aec7aeafd", decimals: 18 },
    ENS:    { address: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", decimals: 18 },
    OCEAN:  { address: "0x967da4048cd07ab37855c090aaf366e4ce1b9f48", decimals: 18 },
    CVX:    { address: "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b", decimals: 18 },
    FXS:    { address: "0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0", decimals: 18 },
    SPELL:  { address: "0x090185f2135308bad17527004364ebcc2d37e5f6", decimals: 18 },
    ANGLE:  { address: "0x31429d1856ad1377a8a0079410b297e1a9e214c2", decimals: 18 },
    // L2 / infrastructure tokens
    ARB:    { address: "0xb50721bcf8d664c30412cfbc6cf7a15145234ad1", decimals: 18 },
    OP:     { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    IMX:    { address: "0xf57e7e7c23978c3caec3c3548e3d615c346e79ff", decimals: 18 },
    MATIC:  { address: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", decimals: 18 },
    CELR:   { address: "0x4f9254c83eb525f9fcf346490bbb3ed28a81c667", decimals: 18 },
    // Gaming / metaverse
    MANA:   { address: "0x0f5d2fb29fb7d3cfee444a200298f468908cc942", decimals: 18 },
    SAND:   { address: "0x3845badade8e6dff049820680d1f14bd3903a5d0", decimals: 18 },
    AXS:    { address: "0xbb0e17ef65f82ab018d8edd776e8dd940327b28b", decimals: 18 },
    APE:    { address: "0x4d224452801aced8b2f0aebe155379bb5d594381", decimals: 18 },
    CHZ:    { address: "0x3506424f91fd33084466f402d5d97f05f8e3b4af", decimals: 18 },
    ENJ:    { address: "0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c", decimals: 18 },
    GALA:   { address: "0xd1d2eb1b1e90b638588728b4130137d262c87cae", decimals: 8  },
    ILV:    { address: "0x767fe9edc9e0df98e07454847909b5e959d7ca0e", decimals: 18 },
    // AI / data tokens
    FET:    { address: "0xaea46a60368a7bd060eec7df8cba43b7ef41ad85", decimals: 18 },
    AGIX:   { address: "0x5b7533812759b45c2b44c19e320ba2cd2681b542", decimals: 8  },
    NMR:    { address: "0x1776e1f26f98b1a5df9cd347953a26dd3cb46671", decimals: 18 },
    // Meme coins
    SHIB:   { address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", decimals: 18 },
    PEPE:   { address: "0x6982508145454ce325ddbe47a25d4ec3d2311933", decimals: 18 },
    FLOKI:  { address: "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e", decimals: 9  },
    BONK:   { address: "0x1151cb3d861920e07a38e03eead12c32178567f6", decimals: 5  },
    // Other major alts (Ethereum-native or bridged)
    FTM:    { address: "0x4e15361fd6b4bb609fa63c81a2be19d873717870", decimals: 18 },
    NEAR:   { address: "0x85f17cf997934a597031b2e18a9ab6ebd4b9f6a4", decimals: 24 },
    FIL:    { address: "0x6e1a19f235be7ed8e3369ef73b196c07257494de", decimals: 18 },
    THETA:  { address: "0x3883f5e181fccaf8410fa61e12b59bad963fb645", decimals: 18 },
    VET:    { address: "0xd850942ef8811f2a866692a623011bde52a462c1", decimals: 18 },
    IOTA:   { address: "0xd0d8c63b2e52e7f9b393f37db1f440dc7c50add6", decimals: 6  },
    ZRX:    { address: "0xe41d2489571d322189246dafa5ebde1f4699f498", decimals: 18 },
    BAT:    { address: "0x0d8775f648430679a709e98d2b0cb6250d2887ef", decimals: 18 },
    REN:    { address: "0x408e41876cccdc0f92210600ef50372656052a38", decimals: 18 },
    KNC:    { address: "0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202", decimals: 18 },
    BNT:    { address: "0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c", decimals: 18 },
    RLC:    { address: "0x607f4c5bb672230e8672085532f7e901544a7375", decimals: 9  },
    STORJ:  { address: "0xb64ef51c888972c908cfacf59b47c1afbc0ab8ac", decimals: 8  },
  },

  // ─── BNB Smart Chain ─────────────────────────────────────────────────────────
  56: {
    USDT:   { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
    USDC:   { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
    DAI:    { address: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", decimals: 18 },
    BUSD:   { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18 },
    WBNB:   { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", decimals: 18 },
    BTCB:   { address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", decimals: 18 },
    ETH:    { address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", decimals: 18 },
    CAKE:   { address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", decimals: 18 },
    LINK:   { address: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", decimals: 18 },
    UNI:    { address: "0xbf5140a22578168fd562dccf235e5d43a02ce9b1", decimals: 18 },
    ADA:    { address: "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47", decimals: 18 },
    DOT:    { address: "0x7083609fce4d1d8dc0c979aab8c869ea2c873402", decimals: 18 },
    XRP:    { address: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", decimals: 18 },
    DOGE:   { address: "0xba2ae424d960c26247dd6c32edc70b295c744c43", decimals: 8  },
    LTC:    { address: "0x4338665cbb7b2485a8855a139b75d5e34ab0db94", decimals: 18 },
    MATIC:  { address: "0xcc42724c6683b7e57334c4e856f4c9965ed682bd", decimals: 18 },
    AVAX:   { address: "0x1ce0c2827e2ef14d5c4f29a091d735a204794041", decimals: 18 },
    ATOM:   { address: "0x0eb3a705fc54725037cc9e008bdede697f62f335", decimals: 18 },
    FTM:    { address: "0xad29abb318791d579433d831ed122afeaf29dcfe", decimals: 18 },
    INJ:    { address: "0xa2b726b1145a4773f68593cf171187d8ebe4d495", decimals: 18 },
    NEAR:   { address: "0x1fa4a73a3f0133f0025378af00236f3abdee5d63", decimals: 18 },
    SHIB:   { address: "0x2859e4544c4bb03966803b044a93563bd2d0dd4d", decimals: 18 },
    PEPE:   { address: "0x25d887ce7a35172c62febfd67a1856f20faebb00", decimals: 18 },
  },

  // ─── Polygon ─────────────────────────────────────────────────────────────────
  137: {
    USDT:   { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6  },
    USDC:   { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
    "USDC.E":{ address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
    USDCE:  { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
    DAI:    { address: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", decimals: 18 },
    WMATIC: { address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", decimals: 18 },
    WETH:   { address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", decimals: 18 },
    WBTC:   { address: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", decimals: 8  },
    LINK:   { address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", decimals: 18 },
    AAVE:   { address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b", decimals: 18 },
    UNI:    { address: "0xb33eaad8d922b1083446dc23f610c2567fb5180f", decimals: 18 },
    SUSHI:  { address: "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a", decimals: 18 },
    CRV:    { address: "0x172370d5cd63279efa6d502dab29171933a610af", decimals: 18 },
    BAL:    { address: "0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3", decimals: 18 },
    GHO:    { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
    SAND:   { address: "0xbbba073c31bf03b8acf7c28ef0738decf3695683", decimals: 18 },
    MANA:   { address: "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4", decimals: 18 },
    AXS:    { address: "0x61bdd9c7d4df4bf47a4508c0c8245505f2af5b7b", decimals: 18 },
    GHST:   { address: "0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7", decimals: 18 },
    IMX:    { address: "0xa35923162c49cf95e6bf26623385eb431ad920d3", decimals: 18 },
  },

  // ─── Base ────────────────────────────────────────────────────────────────────
  8453: {
    USDC:   { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6  },
    USDBC:  { address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", decimals: 6  },
    DAI:    { address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", decimals: 18 },
    WETH:   { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    CBETH:  { address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", decimals: 18 },
    CBBTC:  { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimals: 8  },
    WBTC:   { address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", decimals: 8  },
    USDT:   { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6  },
    LINK:   { address: "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196", decimals: 18 },
    AERO:   { address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631", decimals: 18 },
    BRETT:  { address: "0x532f27101965dd16442e59d40670faf5ebb142e4", decimals: 18 },
    TOSHI:  { address: "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4", decimals: 18 },
    OP:     { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
  },

  // ─── Arbitrum One ────────────────────────────────────────────────────────────
  42161: {
    USDT:   { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6  },
    USDC:   { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6  },
    "USDC.E":{ address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", decimals: 6  },
    USDCE:  { address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", decimals: 6  },
    DAI:    { address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", decimals: 18 },
    WETH:   { address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18 },
    WBTC:   { address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", decimals: 8  },
    ARB:    { address: "0x912ce59144191c1204e64559fe8253a0e49e6548", decimals: 18 },
    LINK:   { address: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", decimals: 18 },
    UNI:    { address: "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0", decimals: 18 },
    GMX:    { address: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", decimals: 18 },
    GLP:    { address: "0x4277f18587e27fe88d9b022d4d98c13db02c62a7", decimals: 18 },
    MAGIC:  { address: "0x539bde0d7dbd336b79148aa742883198bbf60342", decimals: 18 },
    RDNT:   { address: "0x3082cc23568ea640225c2467653db90e9250aaa0", decimals: 18 },
    PENDLE: { address: "0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8", decimals: 18 },
    SUSHI:  { address: "0xd4d42f0b6def4ce0383636770ef773390d85c61a", decimals: 18 },
    CRV:    { address: "0x11cdb42b0eb46d95f990bedd4695a6e3fa034978", decimals: 18 },
    BAL:    { address: "0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8", decimals: 18 },
    AAVE:   { address: "0xba5ddd1f9d7f570dc94a51479a000e3bce967196", decimals: 18 },
    STG:    { address: "0x6694340fc020c5e6b96567843da2df01b2ce1eb6", decimals: 18 },
  },

  // ─── Optimism ────────────────────────────────────────────────────────────────
  10: {
    USDC:   { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6  },
    "USDC.E":{ address: "0x7f5c764cbc14f9669b88837ca1490cca17c31607", decimals: 6  },
    USDCE:  { address: "0x7f5c764cbc14f9669b88837ca1490cca17c31607", decimals: 6  },
    USDT:   { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6  },
    DAI:    { address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", decimals: 18 },
    WETH:   { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    WBTC:   { address: "0x68f180fcce6836688e9084f035309e29bf0a2095", decimals: 8  },
    OP:     { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    LINK:   { address: "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6", decimals: 18 },
    SNX:    { address: "0x8700daec35af8ff88c16bdf0418774cb3d7599b4", decimals: 18 },
    VELO:   { address: "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05", decimals: 18 },
    VELODROME:{ address: "0x9560e827af36c94d2ac33a39bce1fe78631088db", decimals: 18 },
    PERP:   { address: "0x9e1028f5f1d5ede59748ffcee5532509976840e0", decimals: 18 },
    AAVE:   { address: "0x76fb31fb4af56892a25e32cfc43de717950c9278", decimals: 18 },
    CRV:    { address: "0x0994206dfe8de6ec6920ff4d779b0d950605fb53", decimals: 18 },
    BAL:    { address: "0xfe8b128ba8c78aabc59d4c64cee7ff28e9379921", decimals: 18 },
    STG:    { address: "0x296f55f8fb28e498b858d0bcda06d955b2cb3f97", decimals: 18 },
    SUSD:   { address: "0x8c6f28f2f1a3c87f0f938b96d27520d9751ec8d9", decimals: 18 },
    WLD:    { address: "0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1", decimals: 18 },
  },

  // ─── Avalanche C-Chain ───────────────────────────────────────────────────────
  43114: {
    USDT:   { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6  },
    USDC:   { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6  },
    "USDC.E":{ address: "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", decimals: 6  },
    USDCE:  { address: "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", decimals: 6  },
    DAI:    { address: "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", decimals: 18 },
    WETH:   { address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", decimals: 18 },
    WBTC:   { address: "0x50b7545627a5162f82a992c33b87adc75187b218", decimals: 8  },
    WAVAX:  { address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", decimals: 18 },
    JOE:    { address: "0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd", decimals: 18 },
    QI:     { address: "0x8729438eb15e2c8b576fcc6aecda6a148776c0f5", decimals: 18 },
    LINK:   { address: "0x5947bb275c521040051d82396192181b413227a3", decimals: 18 },
    AAVE:   { address: "0x63a72806098bd3d9520cc43356dd78afe5d386d9", decimals: 18 },
    GMX:    { address: "0x62edc0692bd897d2295872a9ffcac5425011c661", decimals: 18 },
    PNG:    { address: "0x60781c2586d68229fde47564546784ab3faca982", decimals: 18 },
    SNOB:   { address: "0xc38f41a296a4493ff429f1238e030924a1542e50", decimals: 18 },
    PEFI:   { address: "0xe896cdeaac9615145c0ca09c8cd5c25bced6384c", decimals: 18 },
    STG:    { address: "0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590", decimals: 18 },
  },

  // ─── Ethereum Sepolia (testnet) ──────────────────────────────────────────────
  11155111: {
    WETH:   { address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", decimals: 18 },
    USDC:   { address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", decimals: 6  },
    USDT:   { address: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0", decimals: 6  },
    DAI:    { address: "0x68194a729c2450ad26072b3d33adacbcef39d574", decimals: 18 },
    LINK:   { address: "0x779877a7b0d9e8603169ddbd7836e478b4624789", decimals: 18 },
    UNI:    { address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18 },
    WBTC:   { address: "0x29f2d40b0605204364af54ec677bd022da425d03", decimals: 8  },
    AAVE:   { address: "0x88541670e55cc00beefd87eb59edd1b7c511ac9a", decimals: 18 },
  },
};

/**
 * Native asset symbol for each supported chain.
 * If `asset.toUpperCase() === NATIVE_SYMBOLS[chainId]`, use `getBalance()`.
 * Otherwise look up the ERC-20 address in TOKEN_REGISTRY.
 */
export const NATIVE_SYMBOLS: Record<number, string> = {
  1:        "ETH",
  56:       "BNB",
  137:      "MATIC",
  8453:     "ETH",
  42161:    "ETH",
  10:       "ETH",
  43114:    "AVAX",
  11155111: "ETH",  // Sepolia testnet
};

/**
 * Look up token info for a given (chainId, symbol) pair.
 * Returns null if the asset is native (use getBalance) or unknown.
 *
 * @param chainId  - Numeric EVM chain ID
 * @param symbol   - Asset symbol (case-insensitive)
 * @returns TokenInfo if the asset is a known ERC-20, null otherwise
 */
export function getTokenInfo(chainId: number, symbol: string): TokenInfo | null {
  const upper = symbol.toUpperCase();
  // Native assets are not in TOKEN_REGISTRY
  if (NATIVE_SYMBOLS[chainId] === upper) return null;
  return TOKEN_REGISTRY[chainId]?.[upper] ?? null;
}

/**
 * Returns true if `symbol` is the native asset for `chainId`
 * (i.e. use `getBalance` rather than `balanceOf`).
 */
export function isNativeAsset(chainId: number, symbol: string): boolean {
  return NATIVE_SYMBOLS[chainId] === symbol.toUpperCase();
}
