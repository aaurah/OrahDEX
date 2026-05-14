import { useEffect, useState, useCallback } from "react";
import { CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS, getWagmiConfig } from "@/lib/reown";

export interface TokenBalance {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
  price: number;
  change24h: number;
  color: string;
  decimals: number;
  isNative?: boolean;
}

// ERC-20 token registry per chainId
const ERC20_TOKENS: Record<number, Array<{ symbol: string; name: string; address: string; decimals: number; color: string }>> = {
  1: [ // Ethereum Mainnet
    { symbol: "USDT",  name: "Tether USD",         address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",         address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  color: "#F97316" },
    { symbol: "DAI",   name: "Dai Stablecoin",      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, color: "#EAB308" },
    { symbol: "WETH",  name: "Wrapped Ether",       address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, color: "#8B5CF6" },
    { symbol: "LINK",  name: "Chainlink",           address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, color: "#3B82F6" },
    { symbol: "UNI",   name: "Uniswap",             address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, color: "#FF007A" },
    { symbol: "AAVE",  name: "Aave",                address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18, color: "#B6509E" },
    { symbol: "LDO",   name: "Lido DAO",            address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", decimals: 18, color: "#00A3FF" },
    { symbol: "CRV",   name: "Curve DAO",           address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18, color: "#EAB308" },
    { symbol: "MKR",   name: "Maker",               address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18, color: "#1AAB9B" },
    { symbol: "SNX",   name: "Synthetix",           address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18, color: "#00D1FF" },
    { symbol: "COMP",  name: "Compound",            address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18, color: "#00D395" },
    { symbol: "GRT",   name: "The Graph",           address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7", decimals: 18, color: "#6747ED" },
    { symbol: "ENS",   name: "Ethereum Name Service", address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72", decimals: 18, color: "#5298FF" },
    { symbol: "RNDR",  name: "Render Token",        address: "0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24", decimals: 18, color: "#FF4500" },
    { symbol: "FET",   name: "Fetch.ai",            address: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85", decimals: 18, color: "#3B82F6" },
    { symbol: "IMX",   name: "Immutable X",         address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF", decimals: 18, color: "#00BFFF" },
    { symbol: "MATIC", name: "Polygon",             address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18, color: "#8247E5" },
    { symbol: "SHIB",  name: "Shiba Inu",           address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18, color: "#FF0000" },
    { symbol: "PEPE",  name: "Pepe",                address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18, color: "#00B140" },
    { symbol: "SAND",  name: "The Sandbox",         address: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0", decimals: 18, color: "#00ADEF" },
    { symbol: "MANA",  name: "Decentraland",        address: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942", decimals: 18, color: "#FF2D55" },
    { symbol: "AXS",   name: "Axie Infinity",       address: "0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b", decimals: 18, color: "#0055D5" },
    { symbol: "OCEAN", name: "Ocean Protocol",      address: "0x967da4048cD07aB37855c090aAF366e4ce1b9F48", decimals: 18, color: "#141414" },
    { symbol: "YFI",   name: "yearn.finance",       address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", decimals: 18, color: "#0066FF" },
    { symbol: "BAL",   name: "Balancer",            address: "0xba100000625a3754423978a60c9317c58a424e3D", decimals: 18, color: "#1E1E1E" },
    { symbol: "SUSHI", name: "SushiSwap",           address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", decimals: 18, color: "#FA52A0" },
    { symbol: "1INCH", name: "1inch",               address: "0x111111111117dC0aa78b770fA6A738034120C302", decimals: 18, color: "#1B314F" },
    { symbol: "DYDX",  name: "dYdX",                address: "0x92D6C1e31e14520e676a687F0a93788B716BEff5", decimals: 18, color: "#6966FF" },
    { symbol: "RPL",   name: "Rocket Pool",         address: "0xD33526068D116cE69F19A9ee46F0bd304F21A51f", decimals: 18, color: "#FF6B00" },
    { symbol: "PENDLE",name: "Pendle",              address: "0x808507121B80c02388fAd14726482e061B8da827", decimals: 18, color: "#3ABAB4" },
    { symbol: "ONDO",  name: "Ondo Finance",        address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", decimals: 18, color: "#1E40AF" },
    { symbol: "LPT",   name: "Livepeer",            address: "0x58b6A8A3302369DAEc383334672404Ee733aB239", decimals: 18, color: "#00EB88" },
    { symbol: "REN",   name: "Ren",                 address: "0x408e41876cCCDC0F92210600ef50372656052a38", decimals: 18, color: "#001C3D" },
  ],
  56: [ // BNB Chain
    { symbol: "USDT",  name: "Tether USD",          address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18, color: "#EAB308" },
    { symbol: "BUSD",  name: "Binance USD",          address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18, color: "#F0B90B" },
    { symbol: "CAKE",  name: "PancakeSwap",          address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18, color: "#633001" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18, color: "#F97316" },
    { symbol: "ETH",   name: "Ethereum (BEP-20)",    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18, color: "#8B5CF6" },
    { symbol: "XRP",   name: "XRP Token",            address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", decimals: 18, color: "#00AAE4" },
    { symbol: "ADA",   name: "Cardano Token",        address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", decimals: 18, color: "#0033AD" },
    { symbol: "DOT",   name: "Polkadot Token",       address: "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", decimals: 18, color: "#E6007A" },
    { symbol: "LINK",  name: "Chainlink",            address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", decimals: 18, color: "#3B82F6" },
    { symbol: "UNI",   name: "Uniswap",              address: "0xBf5140A22578168FD562DCcF235E5D43A02ce9B1", decimals: 18, color: "#FF007A" },
    { symbol: "AVAX",  name: "Avalanche Token",      address: "0x1CE0c2827e2eF14D5C4f29a091d735A204794041", decimals: 18, color: "#E84142" },
    { symbol: "MATIC", name: "Polygon Token",        address: "0xCC42724C6683B7E57334c4E856f4c9965ED682bD", decimals: 18, color: "#8247E5" },
    { symbol: "DOGE",  name: "Dogecoin Token",       address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", decimals: 8,  color: "#C2A633" },
    { symbol: "SHIB",  name: "Shiba Inu",            address: "0x2859e4544C4bB03966803b044A93563Bd2D0DD4D", decimals: 18, color: "#FF0000" },
    { symbol: "PEPE",  name: "Pepe",                 address: "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00", decimals: 18, color: "#00B140" },
    { symbol: "INJ",   name: "Injective",            address: "0xa2B726B1145A4773F68593CF171187d8EBe4d495", decimals: 18, color: "#0082FA" },
    { symbol: "SOL",   name: "Solana Token",         address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", decimals: 18, color: "#9945FF" },
    { symbol: "TON",   name: "Toncoin",              address: "0x76A797A59Ba2C17726896976B7B3747BfD1d220f", decimals: 9,  color: "#0088CC" },
  ],
  137: [ // Polygon
    { symbol: "USDT",  name: "Tether USD",           address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin (PoS)",       address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDCe", name: "USD Coin (Bridged)",   address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, color: "#8B5CF6" },
    { symbol: "LINK",  name: "Chainlink",            address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18, color: "#3B82F6" },
    { symbol: "AAVE",  name: "Aave",                 address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18, color: "#B6509E" },
    { symbol: "CRV",   name: "Curve DAO",            address: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", decimals: 18, color: "#EAB308" },
    { symbol: "UNI",   name: "Uniswap",              address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18, color: "#FF007A" },
    { symbol: "SAND",  name: "The Sandbox",          address: "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683", decimals: 18, color: "#00ADEF" },
    { symbol: "MANA",  name: "Decentraland",         address: "0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4", decimals: 18, color: "#FF2D55" },
    { symbol: "GRT",   name: "The Graph",            address: "0x5fe2B58c013d7601147DcdD68C143A77499f5531", decimals: 18, color: "#6747ED" },
    { symbol: "QUICK", name: "QuickSwap",            address: "0x831753DD7087CaC61aB5644b308642cc1c33Dc13", decimals: 18, color: "#4DCCE1" },
  ],
  42161: [ // Arbitrum One
    { symbol: "USDT",  name: "Tether USD",           address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDCe", name: "USD Coin (Bridged)",   address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8,  color: "#F97316" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, color: "#EAB308" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, color: "#8B5CF6" },
    { symbol: "LINK",  name: "Chainlink",            address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18, color: "#3B82F6" },
    { symbol: "ARB",   name: "Arbitrum",             address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, color: "#28A0F0" },
    { symbol: "GMX",   name: "GMX",                  address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18, color: "#00B0FF" },
    { symbol: "MAGIC", name: "Magic",                address: "0x539bdE0d7Dbd336b79148AA742883198BBF60342", decimals: 18, color: "#DC2626" },
    { symbol: "GRT",   name: "The Graph",            address: "0x9623063377AD1B27544C965cCd7342f7EA7e88C7", decimals: 18, color: "#6747ED" },
    { symbol: "UNI",   name: "Uniswap",              address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", decimals: 18, color: "#FF007A" },
    { symbol: "PENDLE",name: "Pendle",               address: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8", decimals: 18, color: "#3ABAB4" },
    { symbol: "RDNT",  name: "Radiant Capital",      address: "0x3082CC23568eA640225c2467653dB90e9250AaA0", decimals: 18, color: "#FFA800" },
  ],
  10: [ // Optimism
    { symbol: "USDT",  name: "Tether USD",           address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDCe", name: "USD Coin (Bridged)",   address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x4200000000000000000000000000000000000006", decimals: 18, color: "#8B5CF6" },
    { symbol: "OP",    name: "Optimism",             address: "0x4200000000000000000000000000000000000042", decimals: 18, color: "#FF0420" },
    { symbol: "LINK",  name: "Chainlink",            address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6", decimals: 18, color: "#3B82F6" },
    { symbol: "SNX",   name: "Synthetix",            address: "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4", decimals: 18, color: "#00D1FF" },
    { symbol: "AAVE",  name: "Aave",                 address: "0x76FB31fb4af56892A25e32cFC43De717950c9278", decimals: 18, color: "#B6509E" },
    { symbol: "UNI",   name: "Uniswap",              address: "0x6fd9d7AD17242c41f7131d257212c54A0e816691", decimals: 18, color: "#FF007A" },
    { symbol: "AERO",  name: "Aerodrome",            address: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", decimals: 18, color: "#E25BFF" },
  ],
  8453: [ // Base
    { symbol: "USDT",  name: "Tether USD",           address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDbC", name: "USD Base Coin",        address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, color: "#EAB308" },
    { symbol: "cbBTC", name: "Coinbase BTC",         address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8,  color: "#F97316" },
    { symbol: "cbETH", name: "Coinbase ETH",         address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, color: "#8B5CF6" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x4200000000000000000000000000000000000006", decimals: 18, color: "#8B5CF6" },
    { symbol: "AERO",  name: "Aerodrome",            address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18, color: "#E25BFF" },
    { symbol: "BRETT", name: "Brett",                address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", decimals: 18, color: "#1E90FF" },
    { symbol: "TOSHI", name: "Toshi",                address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", decimals: 18, color: "#F59E0B" },
    { symbol: "DEGEN", name: "Degen",                address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18, color: "#A855F7" },
    { symbol: "HIGHER",name: "Higher",               address: "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe", decimals: 18, color: "#22C55E" },
    { symbol: "NORMIE",name: "Normie",               address: "0x7F12d13B34F5F4f0a9449c89bCE986DC2d4d6d72", decimals: 9,  color: "#F97316" },
    { symbol: "BALD",  name: "Bald",                 address: "0x27D2DECb4bFC9C76F0309b8E88dec3a601Fe25a8", decimals: 18, color: "#F59E0B" },
    { symbol: "MOG",   name: "Mog Coin",             address: "0x2Da56AcB9Ea78330f947bD57C54119Debda7AF71", decimals: 18, color: "#7C3AED" },
    { symbol: "VIRTUAL",name: "Virtuals Protocol",  address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7020", decimals: 18, color: "#6366F1" },
    { symbol: "SEAM",  name: "Seamless",             address: "0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85", decimals: 18, color: "#00D4AA" },
    { symbol: "LINK",  name: "Chainlink",            address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 18, color: "#3B82F6" },
  ],
  43114: [ // Avalanche C-Chain
    { symbol: "USDT",  name: "Tether USD",           address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x50b7545627a5162F82A992c33b87aDc75187B218", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", decimals: 18, color: "#8B5CF6" },
    { symbol: "JOE",   name: "Trader Joe",           address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", decimals: 18, color: "#E05C2E" },
    { symbol: "LINK",  name: "Chainlink",            address: "0x5947BB275c521040051D82396192181b413227A3", decimals: 18, color: "#3B82F6" },
    { symbol: "AAVE",  name: "Aave",                 address: "0x63a72806098Bd3D9520cC43356dD78afe5D386D9", decimals: 18, color: "#B6509E" },
  ],
  59144: [ // Linea
    { symbol: "USDT",  name: "Tether USD",           address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", decimals: 6,  color: "#3B82F6" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d8", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34e", decimals: 18, color: "#8B5CF6" },
  ],
  534352: [ // Scroll
    { symbol: "USDC",  name: "USD Coin",             address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDT",  name: "Tether USD",           address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df", decimals: 6,  color: "#22C55E" },
    { symbol: "DAI",   name: "Dai Stablecoin",       address: "0xcA77eB3fEFe3725Dc33bccB54eDEFc3D9f764f97", decimals: 18, color: "#EAB308" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x3C1BCa5a656e69edCD0D4E36BEbb3FcDAcA60Cf1", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x5300000000000000000000000000000000000004", decimals: 18, color: "#8B5CF6" },
  ],
  5000: [ // Mantle
    { symbol: "USDT",  name: "Tether USD",           address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0xCAbAE6f6Ea1ecaB08Ad02fE02ce9A44F09aebfA2", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18, color: "#8B5CF6" },
  ],
  324: [ // zkSync Era
    { symbol: "USDC",  name: "USD Coin",             address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4", decimals: 6,  color: "#3B82F6" },
    { symbol: "USDT",  name: "Tether USD",           address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C", decimals: 6,  color: "#22C55E" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0xBBeB516fb02a01611cBBE0453Fe3c580D7281011", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91", decimals: 18, color: "#8B5CF6" },
  ],
  250: [ // Fantom
    { symbol: "USDT",  name: "Tether USD",           address: "0x049d68029688eAbF473097a2fC38ef61633A3C7A", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x321162Cd933E2Be498Cd2267a90534A804051b11", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0x74b23882a30290451A17c44f4F05243b6b58C76d", decimals: 18, color: "#8B5CF6" },
    { symbol: "LINK",  name: "Chainlink",            address: "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8", decimals: 18, color: "#3B82F6" },
  ],
  25: [ // Cronos
    { symbol: "USDT",  name: "Tether USD",           address: "0x66e428c3f67a68878562e79A0234c1F83c208770", decimals: 6,  color: "#22C55E" },
    { symbol: "USDC",  name: "USD Coin",             address: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", decimals: 6,  color: "#3B82F6" },
    { symbol: "WBTC",  name: "Wrapped BTC",          address: "0x062E66477Faf219F25D27dCED647BF57C3107d52", decimals: 8,  color: "#F97316" },
    { symbol: "WETH",  name: "Wrapped Ether",        address: "0xe44Fd7fCb2b1581822D0c862B68222998a0c299a", decimals: 18, color: "#8B5CF6" },
  ],
};

const NATIVE_TOKENS: Record<number, { symbol: string; name: string; color: string; cgId: string }> = {
  1:      { symbol: "ETH",  name: "Ethereum",      color: "#8B5CF6", cgId: "ethereum" },
  56:     { symbol: "BNB",  name: "BNB",            color: "#EAB308", cgId: "binancecoin" },
  137:    { symbol: "POL",  name: "Polygon",        color: "#7C3AED", cgId: "matic-network" },
  42161:  { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  10:     { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  8453:   { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  324:    { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  43114:  { symbol: "AVAX", name: "Avalanche",      color: "#E84142", cgId: "avalanche-2" },
  59144:  { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  534352: { symbol: "ETH",  name: "Ethereum",       color: "#8B5CF6", cgId: "ethereum" },
  5000:   { symbol: "MNT",  name: "Mantle",         color: "#00A3FF", cgId: "mantle" },
  250:    { symbol: "FTM",  name: "Fantom",         color: "#3B82F6", cgId: "fantom" },
  25:     { symbol: "CRO",  name: "Cronos",         color: "#3B82F6", cgId: "crypto-com-chain" },
};

// Symbols treated as USD-pegged stablecoins (price = 1.0)
const STABLECOINS = new Set(["USDT","USDC","USDbC","USDCe","DAI","BUSD","TUSD","USDD","FDUSD","FRAX","LUSD","USDB","GUSD","USDP","PYUSD"]);

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// balanceOf(address) ERC-20 call data
function balanceOfCalldata(address: string): string {
  const padded = address.toLowerCase().replace("0x", "").padStart(64, "0");
  return "0x70a08231" + padded;
}

/**
 * RPC call wrapper — tries public RPC primary, then fallback, then injected wallet.
 * All paths are tried so WalletConnect / mobile wallets work without window.ethereum.
 */
async function rpcCall(method: string, params: any[], chainId: number): Promise<any> {
  const urls = [CHAIN_RPC_URLS[chainId], CHAIN_RPC_FALLBACKS[chainId]].filter(Boolean);
  for (const rpcUrl of urls) {
    try {
      const res = await globalThis.fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.error && json.result !== undefined) return json.result;
      }
    } catch { /* try next */ }
  }

  const injected = (window as any).ethereum;
  if (injected) {
    try {
      const walletChainHex: string = await injected.request({ method: "eth_chainId", params: [] });
      const walletChain = parseInt(walletChainHex, 16);
      if (walletChain === chainId) {
        return await injected.request({ method, params });
      }
    } catch { /* ignore */ }
  }

  throw new Error(`No RPC available for chainId ${chainId}`);
}

/**
 * Fetch USD prices for all tokens from the OrahDEX markets API.
 * Returns a symbol → USD price map, stablecoins always = 1.
 */
async function fetchMarketPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // Stablecoins are always $1
  for (const sym of STABLECOINS) prices[sym] = 1;

  try {
    // Use /api/prices — Binance-sourced real prices, never internal order book
    const res = await globalThis.fetch(`${BASE_URL}/api/prices`, { cache: "no-store" });
    if (res.ok) {
      const data: Record<string, number> = await res.json();
      for (const [sym, usd] of Object.entries(data)) {
        if (sym && usd > 0) prices[sym] = usd;
      }
    }
  } catch { /* use hardcoded fallbacks only */ }

  // Hardcoded last-resort fallbacks for native gas tokens
  if (!prices["ETH"])  prices["ETH"]  = 2400;
  if (!prices["BNB"])  prices["BNB"]  = 580;
  if (!prices["AVAX"]) prices["AVAX"] = 18;
  if (!prices["FTM"])  prices["FTM"]  = 0.2;
  if (!prices["CRO"])  prices["CRO"]  = 0.09;
  if (!prices["MNT"])  prices["MNT"]  = 1.02;
  if (!prices["POL"])  prices["POL"]  = 0.32;
  if (!prices["MATIC"])prices["MATIC"]= 0.32;

  return prices;
}

export function useEvmBalances(address: string | null, chainId: number | null) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const fetch = useCallback(async () => {
    if (!address || !chainId) return;
    const resolvedChainId: number = chainId;

    setLoading(true);
    try {
      // Prefer wagmi getBalance for native token (works with WalletConnect on mobile)
      async function fetchNativeAmount(): Promise<number> {
        const config = getWagmiConfig();
        if (config) {
          try {
            const { getBalance } = await import("@wagmi/core");
            const result = await getBalance(config, {
              address: address as `0x${string}`,
              chainId: resolvedChainId,
            });
            return Number(result.value) / 1e18;
          } catch { /* fall through to rpcCall */ }
        }
        const hex = await rpcCall("eth_getBalance", [address, "latest"], resolvedChainId);
        return Number(BigInt(hex)) / 1e18;
      }

      // Fetch prices and native balance in parallel
      const [usdPrices, nativeAmount] = await Promise.all([
        fetchMarketPrices(),
        fetchNativeAmount(),
      ]);
      const nativeDef = NATIVE_TOKENS[chainId] ?? { symbol: "ETH", name: "Ethereum", color: "#8B5CF6", cgId: "ethereum" };
      const nativePrice = usdPrices[nativeDef.symbol] ?? usdPrices["ETH"] ?? 0;

      const result: TokenBalance[] = [];

      // Always include native token
      result.push({
        symbol: nativeDef.symbol,
        name: nativeDef.name,
        amount: nativeAmount,
        usdValue: nativeAmount * nativePrice,
        price: nativePrice,
        change24h: 0,
        color: nativeDef.color,
        decimals: 18,
        isNative: true,
      });

      // Fetch all registered ERC-20 balances for this chain
      const tokens = ERC20_TOKENS[chainId] ?? [];
      const erc20Results = await Promise.allSettled(
        tokens.map(async (token) => {
          const hexBal: string = await rpcCall("eth_call", [
            { to: token.address, data: balanceOfCalldata(address) },
            "latest",
          ], chainId);
          const raw = hexBal && hexBal.length > 2 ? BigInt(hexBal) : 0n;
          const amount = Number(raw) / Math.pow(10, token.decimals);
          return { token, amount };
        })
      );

      for (const r of erc20Results) {
        if (r.status !== "fulfilled") continue;
        const { token, amount } = r.value;
        if (amount <= 0) continue;
        const price = usdPrices[token.symbol] ?? 0;
        result.push({
          symbol: token.symbol,
          name: token.name,
          amount,
          usdValue: amount * price,
          price,
          change24h: 0,
          color: token.color,
          decimals: STABLECOINS.has(token.symbol) ? 2 : token.symbol === "WBTC" || token.symbol === "cbBTC" ? 6 : 4,
        });
      }

      // Sort by USD value descending
      result.sort((a, b) => b.usdValue - a.usdValue);

      setBalances(result);
      setLastFetch(Date.now());
    } catch (err) {
      console.error("EVM balance fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    if (!address || !chainId) return;
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [fetch]);

  return { balances, loading, refresh: fetch, lastFetch };
}
