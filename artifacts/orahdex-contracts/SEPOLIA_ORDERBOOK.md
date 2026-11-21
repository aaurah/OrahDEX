# Sepolia orderbook escrow readiness

The wallet connector already offers Ethereum Sepolia. Orderbook trades remain
disabled until a dedicated `OrahDEXOrderbookEscrow` is deployed and configured;
the generic escrow address is not enough.

The API requires all of the following before it reports Sepolia orderbook
trading as available:

- `EVM_ORDERBOOK_ESCROW_SEPOLIA_ENABLED=true`
- `EVM_ORDERBOOK_MATCHING_SEPOLIA_ENABLED=true`
- `EVM_ORDERBOOK_ESCROW_SEPOLIA` set to the deployed orderbook contract
- `EVM_ORDERBOOK_ESCROW_SEPOLIA_DEPLOY_BLOCK` set to its deployment block
- `EVM_ORDERBOOK_RELAYER_SEPOLIA_KEY` set to a dedicated Sepolia-only relayer key
- `EVM_ORDERBOOK_SEPOLIA_FEE_RECIPIENT` set to the testnet fee recipient address
- `SEPOLIA_RPC_URL` (optional; public Sepolia RPC is the default)

The backend checks contract bytecode and the `feeBps`, `orders`, and
`settledFills` interfaces. Preview order creation is allowed only for a
configured Sepolia limit order; mainnet and other preview orders remain paused.
The initial supported Sepolia markets are ETH/DAI and DAI/ETH. A8 is not a
registered Sepolia asset and is not enabled by this setup.

To prepare a deployment, first review the contract, its tests, fee recipient,
and funding plan. The deployment command uses the separate
`SEPOLIA_DEPLOYER_PRIVATE_KEY` secret and requires `ALLOW_SEPOLIA_ORDERBOOK_DEPLOY=true`
to broadcast; do not set it without explicit deployment approval. No deployment
is performed by the source build or contract test commands.
