/**
 * Known on-chain contract addresses for common tokens.
 * Keyed by TOKEN_SYMBOL -> { "Chain Name": "0x..." }
 *
 * Addresses are the canonical contract for each token on each chain.
 * "native" = the token is the native gas token on that chain (no contract).
 * 0xEeee…EeEE = standard placeholder address used by protocols to denote native ETH.
 */
export const KNOWN_CONTRACTS: Record<string, Record<string, string>> = {
  ETH: {
    "Ethereum":               "native",
    "Arbitrum One":           "native",
    "Optimism":               "native",
    "Base":                   "native",
    "Linea":                  "native",
    "Blast":                  "native",
    "Scroll":                 "native",
    "Unichain":               "native",
    "World Chain":            "native",
    "zkLink Nova":            "native",
    "EthereumPoW":            "native",
    "Near Aurora":            "native",
    "BNB Smart Chain":        "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    "Polygon":                "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    "Avalanche C-Chain":      "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
    "HECO":                   "0x64ff637fb478863b7468bc97d30a5bf3a428a1fd",
    "zkSync Era":             "0x000000000000000000000000000000000000800A",
    "Starknet":               "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "Solana (WETH)":          "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    "KAIA":                   "0x34d21b1e550d73cee41151c77f3c73359527a396",
    "Osmosis":                "ibc/EA1D43981D5C9A1C4AAEA9C23BB1D4FA126BA9BC7020A25CC4",
    "Tezos":                  "KT19at7rQUvyjxnZ2fBv7D9zc8rkyG7gAoU8",
    "Viction":                "0x2eaa73bd0db20c64f53febea7b5f5e5d26d5f57a",
    "RSK":                    "0x1D931Bf8656d795E9B65Cfe7e7f3D6a80a7e68dF",
    "Velas":                  "0x85219708D49AaFcE08E2e3d0b4F469Ef5F6f49c",
    "Sora":                   "0x0200070000000000000000000000000000000000",
    "Sophon":                 "0x72af4452b1a12a58ecfad1e5f5d32c1e1bb7d39c",
    "Fuel Network":           "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07",
    "Krown":                  "0x6f9e22b5e7b2d8f4f978e1028a3e4b66d2df0ac0",
  },

  BTC: {
    "Bitcoin":                "native",
    "Ethereum (WBTC)":        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    "BNB Smart Chain (BTCB)": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "Polygon (WBTC)":         "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BFD6",
    "Arbitrum One (WBTC)":    "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "Avalanche C-Chain":      "0x152b9d0FdC40C096757F570Be9Ee9FAF2C4b2b43",
    "Optimism (WBTC)":        "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
    "Base (cbBTC)":           "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    "Solana (WBTC)":          "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    "Tron (WBTC)":            "TXpw16XoZxnLAEBbFGJNaHJzkHB4MNRM7t",
    "zkSync Era":             "0xBBeB516fb02a01611cBBE0453Fe3c580D7281011",
    "HECO":                   "0x66a79D23E58475D2738179Ca52cd0b41d73f0BEa",
  },

  USDT: {
    "Ethereum":               "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "BNB Smart Chain":        "0x55d398326f99059fF775485246999027B3197955",
    "Tron":                   "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "Polygon":                "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "Arbitrum One":           "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "Optimism":               "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    "Avalanche C-Chain":      "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "Solana":                 "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "Base":                   "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    "Linea":                  "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    "Blast":                  "0xf7f225b3e91be5F2A7db7Bff0e2EbF8D5C36Bff7",
    "Scroll":                 "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
    "zkSync Era":             "0x493257fD37EDB34451f62EDf8D2a0C418852bA4c",
    "Starknet":               "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    "Osmosis":                "ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB",
    "HECO":                   "0xa71EdC38d189767582C38A3145b5873052c3e47a",
    "KAIA":                   "0xcee8faf64bb97a73bb51e115aa89c17ffa8dd167",
    "Near Aurora":            "0x4988a896b1227218e4A686fdE5EabdcAbd91571f",
    "Viction":                "0x381B31409e4D220919B2cFF012ED94d70135A59e",
    "Tezos":                  "KT1XnTn74bUtxHfDtBmm2bGZAoanbLHvTq6a",
    "zkLink Nova":            "0x2F8A25ac62179B31D62D7F80884AE57464699059",
    "Ton":                    "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    "Algorand":               "312769",
    "EOS":                    "tethertether",
    "RSK":                    "0xef213441A85dF4d7ACBdAe0Cf78004E1e486BB96",
  },

  USDC: {
    "Ethereum":               "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "BNB Smart Chain":        "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    "Polygon":                "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    "Arbitrum One":           "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "Optimism":               "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "Avalanche C-Chain":      "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "Base":                   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "Solana":                 "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Linea":                  "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    "Scroll":                 "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
    "zkSync Era":             "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4",
    "Starknet":               "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    "KAIA":                   "0x608792deb376cce1c9fa4d0e6b7b44f507cfFa6",
    "Near Aurora":            "0xB12BFca5A55806AaF64E99521918A4bf0fC40802",
    "Osmosis":                "ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858",
    "zkLink Nova":            "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
    "Tron":                   "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
    "Ton":                    "EQB-MPwrd1G6WKNkLz_VnV6WqBDd142KMQv-g1O-8QUA3728",
    "Viction":                "0x0Fd0288AAAE91eaF935e2eC14b23486f86516c8C",
    "Blast":                  "0x4300000000000000000000000000000000000003",
    "HECO":                   "0x9362Bbef4B8313A8Aa9f0c9808B80577Aa26B73B",
  },

  BNB: {
    "BNB Smart Chain":        "native",
    "Ethereum":               "0xB8c77482e45F1F44dE1745F52C74426C631bDD52",
    "Arbitrum One":           "0x20865e63B111B2649ef829EC220536c82C58ad7B",
    "Polygon":                "0x3BA4c387f786bFEE076A58914F5Bd38d668B42c",
    "Avalanche C-Chain":      "0x264c1383EA520f73dd837F915ef3a732e204a493",
    "opBNB":                  "native",
  },

  SOL: {
    "Solana":                 "native",
    "Ethereum":               "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
    "BNB Smart Chain":        "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
    "Polygon":                "0x7DdDf4F64f7B740e35B1CF1d20D2ab84B1E7eFD6",
    "Arbitrum One":           "0x2bCe4f8d84FcBDCBDBC24E6fC1F5dF28F5D8C8c8",
    "Near Aurora":            "0xca05e6776e0b4d0d1c40c6e33d5e52e6e4ef64Bb",
  },

  XRP: {
    "BNB Smart Chain":        "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe",
    "Ethereum":               "0x628F76eAB0C1298F7a24d337bBbf1ef8A1Ea6A24",
    "Polygon":                "0xCc2a9051E904916047c26C90f41057D35C496Ee3",
  },

  ADA: {
    "BNB Smart Chain":        "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
    "Ethereum":               "0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55",
    "Polygon":                "0xa0D8b43e3e8D3Cf9E2f8B33A1eFb03Db0cBc9Edb",
  },

  DOGE: {
    "BNB Smart Chain":        "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
    "Ethereum":               "0x4206931337dc273a630d328dA6441786BfaD668f",
    "Polygon":                "0x8b1f836491903743fE51ACd13f2CC8Ab95b270f6",
    "Solana":                 "9SdNBFmS8rNJLGv4hkAygGmPMhQUvvzJ1y3VbMW7iy5Q",
  },

  AVAX: {
    "Avalanche C-Chain":      "native",
    "Ethereum":               "0x85f138bfEE4ef8e540890CFb48F620571d67Eda3",
    "BNB Smart Chain":        "0x1CE0c2827e2eF14D5C4f29a091d735A204794041",
    "Arbitrum One":           "0x2C89bbc92BD86F8075d1DEcc58C7F4E0107f286b",
    "Polygon":                "0x2C89bbc92BD86F8075d1DEcc58C7F4E0107f286b",
  },

  MATIC: {
    "Polygon":                "native",
    "Ethereum":               "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    "BNB Smart Chain":        "0xCC42724C6683B7E57334c4E856f4c9965ED682bD",
    "Arbitrum One":           "0x561877b6b3DD7651313794e5F2894B2F18bE0766",
  },

  DOT: {
    "BNB Smart Chain":        "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
    "Ethereum":               "0xFfFFfFff1FcaCBd218EDc0EbA20Fc2308C778080",
    "Moonbeam":               "native",
  },

  LINK: {
    "Ethereum":               "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    "BNB Smart Chain":        "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    "Polygon":                "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    "Arbitrum One":           "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
    "Avalanche C-Chain":      "0x5947BB275c521040051D82396192181b413227A3",
    "Optimism":               "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6",
    "Base":                   "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
    "Solana":                 "CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjpUL",
  },

  UNI: {
    "Ethereum":               "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "BNB Smart Chain":        "0xBf5140A22578168FD562DCcF235E5D43A02ce9B1",
    "Polygon":                "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
    "Arbitrum One":           "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
    "Optimism":               "0x6fd9d7AD17242c41f7131d257212c54A0e816691",
  },

  AAVE: {
    "Ethereum":               "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    "Polygon":                "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    "Avalanche C-Chain":      "0x63a72806098Bd3D9520cC43356dD78afe5D386D9",
    "Optimism":               "0x76FB31fb4af56892A25e32cFC43De717950c9278",
    "Arbitrum One":           "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
    "BNB Smart Chain":        "0xfb6115445Bff7b52FeB98650C87f44907E58f802",
  },

  DAI: {
    "Ethereum":               "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "Polygon":                "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    "BNB Smart Chain":        "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    "Arbitrum One":           "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    "Optimism":               "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    "Avalanche C-Chain":      "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
    "Base":                   "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    "zkSync Era":             "0x4B9eb6c0b6ea15176BBF62841C6359c1F4eAFa73",
  },

  SHIB: {
    "Ethereum":               "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    "BNB Smart Chain":        "0x2859e4544C4bB03966803b044A93563Bd2D0DD4D",
    "Polygon":                "0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec",
    "Solana":                 "CiKu4eHsVrc1eueVQeHn7qhXTcVu95gSQmBpX4utjL9z",
  },

  PEPE: {
    "Ethereum":               "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    "BNB Smart Chain":        "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00",
    "Arbitrum One":           "0xA54aC5F814F7c77dBe6A3B6d1D9f8a26f9A3A0a0",
    "Base":                   "0xE3086852A4B125803C815a158249ae468A3254Ca",
    "Solana":                 "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  },

  ARB: {
    "Arbitrum One":           "0x912CE59144191C1204E64559FE8253a0e49E6548",
    "Ethereum":               "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
    "BNB Smart Chain":        "0xa050FFb3eEb8200eEB7F61ce34FF644420FD3522",
  },

  OP: {
    "Optimism":               "native",
    "Ethereum":               "0x4200000000000000000000000000000000000042",
    "BNB Smart Chain":        "0x8F3aD5641c19d74caed28B70C5Cd9BDee4f38A9B",
  },

  LTC: {
    "BNB Smart Chain":        "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94",
    "Ethereum":               "0xAbb39FBfbCa56B6B5b9C3aFEaCeEc7c90AdF11C3",
    "Solana":                 "9GfGqjBzjkUBNVGqt3mkCEHD3NjTJ1DXKL3ZQHE9b31",
  },

  BCH: {
    "BNB Smart Chain":        "0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf",
    "Ethereum":               "0x5d6e3d7632D6719e04cA162be652164Bec1cDA7c",
    "Polygon":                "0x56EdF679B0C80D528E17c5Ffe514dc9a1b254b9b",
  },

  TRX: {
    "Tron":                   "native",
    "BNB Smart Chain":        "0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B",
    "Ethereum":               "0xE1Be5D3f34e89dE342Ee97E6e90D405884dA6c67",
  },

  ATOM: {
    "Cosmos Hub":             "native",
    "BNB Smart Chain":        "0x0Eb3a705fc54725037CC9e008bDede697f62F335",
    "Ethereum":               "0x8D983cb9388EaC77af0474fA441C4815500Cb7BB",
    "Osmosis":                "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
  },

  NEAR: {
    "NEAR":                   "native",
    "Near Aurora":            "native",
    "Ethereum":               "0x85F17Cf997934a597031b2E18a9aB6ebD4B9f6a4",
    "BNB Smart Chain":        "0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63",
    "Arbitrum One":           "0x1FF7F3EFBb9481Cbd7db4F932cBCD4467144237C",
  },

  SUI: {
    "Sui":                    "native",
    "BNB Smart Chain":        "0x8f2f8b6283d7fa5b672b530cbb84fcccb4ff8dc40",
    "Ethereum":               "0x84074EA631dEc7a4edcD5303d164D5dEa4c5D657",
    "Solana":                 "9gP2kCy3wA1ctvYWQk75guqXuzoJtEs5bMHEdFoS8c8B",
  },

  INJ: {
    "Ethereum":               "0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30",
    "BNB Smart Chain":        "0xa2B726B1145A4773F1a3587Ab1F80e97D5Cc7D4b",
    "Injective":              "native",
  },

  APT: {
    "Aptos":                  "native",
    "BNB Smart Chain":        "0x4F0B4661a2d3Fa9d39E0c3F5C35C0B6AA64fC3e7",
    "Ethereum":               "0xd5d0B5E4D97CB6E3B97F79d0A5a4d74F4e68E5cc",
  },

  MKR: {
    "Ethereum":               "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    "BNB Smart Chain":        "0x5f0Da599BB2ccCfcf6Fdfd7D81743B6020864350",
  },

  CRV: {
    "Ethereum":               "0xD533a949740bb3306d119CC777fa900bA034cd52",
    "Polygon":                "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
    "Avalanche C-Chain":      "0x249848BeCA43aC405b8102Ec90Dd5F22CA513c06",
    "Arbitrum One":           "0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978",
  },

  FET: {
    "Ethereum":               "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
    "BNB Smart Chain":        "0x031b41e504677879370e9DBcF937283A8691Fa7f",
    "Arbitrum One":           "0x910F5Bf7Ad72DfCf91c1C1d29D1A0eE2a3EA6E3a",
  },

  BSV: {
    "Bitcoin SV":             "native",
    "Ethereum (BSVB)":        "0x6F9D224e3E9f671D5F7F48d21bC1FC9E51B5D0e9",
  },

  WBTC: {
    "Ethereum":               "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    "Polygon":                "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BFD6",
    "Arbitrum One":           "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "Optimism":               "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
    "Avalanche C-Chain":      "0x50b7545627a5162F82A992c33b87aDc75187B218",
    "BNB Smart Chain":        "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "Solana":                 "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    "zkSync Era":             "0xBBeB516fb02a01611cBBE0453Fe3c580D7281011",
    "Base (cbBTC)":           "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  },

  TON: {
    "TON":                    "native",
    "Ethereum":               "0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1",
    "BNB Smart Chain":        "0x76A797A59Ba2C17726896976B7B3747BfD1d220f",
    "Tron":                   "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  },

  NOT: {
    "TON":                    "EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT",
    "BNB Smart Chain":        "0xDCEec8F6dE84b57fE8A67a0d4B6E9E85781c72E8",
  },

  WLD: {
    "Optimism":               "0xdC6fF44d5d932Cbd77B52E5612Ba0529DC6226F1",
    "Ethereum":               "0x163f8C2467924be0ae7B5347228CABF260318753",
    "Polygon":                "0x2B97B3Cca5CbC3c6Eb5f43Ab2f7A9b3a8d2E13bB",
  },

  JUP: {
    "Solana":                 "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  },

  PYTH: {
    "Solana":                 "HZ1JovNiVvGqNLQLjjxVno1hBQQAicpEjaNZqBd4fh",
    "Ethereum":               "0x4305FB66699C3B2702D4d05CF36551390A4c69C6",
    "BNB Smart Chain":        "0x4D7E825f80BDf85e913E0DD2A2D54927e9dE1594",
  },

  W: {
    "Solana":                 "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
    "Ethereum":               "0xB0fFa8000886e57F86dd5264b9582b2Ad87b2b91",
  },
};

/**
 * Get all contract addresses for a token — DB-stored addresses take priority;
 * the lookup table fills in any missing chains as a fallback.
 */
export function getContractAddresses(
  baseAsset: string,
  dbAddresses?: Record<string, string> | null
): Record<string, string> {
  const lookup = KNOWN_CONTRACTS[baseAsset.toUpperCase()] ?? {};
  return { ...lookup, ...(dbAddresses ?? {}) };
}

/**
 * Format an address for display: 0x1234...5678 or full for short addresses.
 */
export function shortAddr(addr: string, chars = 4): string {
  if (!addr || addr === "native") return addr;
  if (addr.startsWith("0x") && addr.length > chars * 2 + 2) {
    return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
  }
  if (addr.length > chars * 2 + 1) {
    return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
  }
  return addr;
}

/**
 * Returns a blockchain explorer URL for the given chain + address.
 */
export function explorerUrl(chain: string, address: string): string | null {
  if (!address || address === "native") return null;
  const c = chain.toLowerCase();

  // Ethereum & EVM L2s
  if (c.includes("ethereum") && !c.includes("pow"))
                                return `https://etherscan.io/token/${address}`;
  if (c.includes("ethereumpow") || c.includes("ethw"))
                                return `https://www.oklink.com/en/ethw/token/${address}`;
  if (c.includes("bnb") || c.includes("bsc") || c.includes("bep20"))
                                return `https://bscscan.com/token/${address}`;
  if (c.includes("polygon"))    return `https://polygonscan.com/token/${address}`;
  if (c.includes("arbitrum"))   return `https://arbiscan.io/token/${address}`;
  if (c.includes("optimism"))   return `https://optimistic.etherscan.io/token/${address}`;
  if (c.includes("avalanche"))  return `https://snowtrace.io/token/${address}`;
  if (c.includes("base"))       return `https://basescan.org/token/${address}`;
  if (c.includes("linea"))      return `https://lineascan.build/token/${address}`;
  if (c.includes("blast"))      return `https://blastscan.io/token/${address}`;
  if (c.includes("scroll"))     return `https://scrollscan.com/token/${address}`;
  if (c.includes("unichain"))   return `https://unichain.blockscout.com/token/${address}`;
  if (c.includes("world chain") || c.includes("worldchain"))
                                return `https://worldchain-mainnet.explorer.alchemy.com/token/${address}`;
  if (c.includes("zklink"))     return `https://explorer.zklink.io/address/${address}`;
  if (c.includes("zksync"))     return `https://explorer.zksync.io/address/${address}`;
  if (c.includes("starknet"))   return `https://starkscan.co/token/${address}`;
  if (c.includes("heco"))       return `https://hecoinfo.com/token/${address}`;
  if (c.includes("kaia"))       return `https://kaiascan.io/token/${address}`;
  if (c.includes("rsk"))        return `https://explorer.rsk.co/address/${address}`;
  if (c.includes("velas"))      return `https://evmexplorer.velas.com/token/${address}`;
  if (c.includes("viction"))    return `https://www.vicscan.xyz/token/${address}`;
  if (c.includes("sophon"))     return `https://explorer.sophon.xyz/token/${address}`;
  if (c.includes("krown"))      return `https://kronoscan.com/token/${address}`;
  if (c.includes("opbnb"))      return `https://opbnbscan.com/token/${address}`;
  if (c.includes("moonbeam"))   return `https://moonscan.io/token/${address}`;

  // Non-EVM chains
  if (c.includes("solana"))     return `https://solscan.io/token/${address}`;
  if (c.includes("tron"))       return `https://tronscan.org/#/token20/${address}`;
  if (c.includes("near") || c.includes("aurora"))
                                return `https://nearblocks.io/token/${address}`;
  if (c.includes("osmosis"))    return `https://www.mintscan.io/osmosis/assets`;
  if (c.includes("cosmos"))     return `https://www.mintscan.io/cosmos/assets`;
  if (c.includes("tezos"))      return `https://tzkt.io/${address}`;
  if (c.includes("ton"))        return `https://tonscan.org/jetton/${address}`;
  if (c.includes("fuel"))       return `https://app.fuel.network/assets/${address}`;
  if (c.includes("sora"))       return `https://polkaswap.io/#/wallet`;
  if (c.includes("algorand"))   return `https://explorer.perawallet.app/assets/${address}`;
  if (c.includes("eos"))        return `https://bloks.io/tokens/${address}`;
  if (c.includes("sui"))        return `https://suiscan.xyz/mainnet/coin/${address}`;
  if (c.includes("aptos"))      return `https://aptoscan.com/coin/${address}`;
  if (c.includes("injective"))  return `https://explorer.injective.network`;

  return null;
}
