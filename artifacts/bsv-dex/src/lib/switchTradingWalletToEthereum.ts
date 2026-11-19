import { mainnet } from "viem/chains";
import { useWalletStore } from "@/store/useWalletStore";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

async function switchEip1193Provider(provider: Eip1193Provider) {
  const chainId = `0x${mainnet.id.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error: any) {
    if (error?.code !== 4902 && error?.code !== -32603) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: "Ethereum Mainnet",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://ethereum-rpc.publicnode.com"],
        blockExplorerUrls: ["https://etherscan.io"],
      }],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }

  const currentChain = await provider.request({ method: "eth_chainId" });
  if (Number(currentChain) !== mainnet.id) {
    throw new Error("Your wallet did not switch to Ethereum Mainnet.");
  }
}

/**
 * Ask the connected wallet to use Ethereum, the currently verified mainnet
 * orderbook. This never signs a transaction or moves funds.
 */
export async function switchTradingWalletToEthereum(providerType: string | null) {
  const store = useWalletStore.getState();

  if (providerType === "orah-wallet") {
    store.switchChain(mainnet.id);
    return;
  }

  if (providerType === "reown") {
    const [{ switchChain: wagmiSwitchChain }, { wagmiAdapter, saveReownChain }] =
      await Promise.all([
        import("wagmi/actions"),
        import("@/lib/reown-appkit"),
      ]);
    try {
      await wagmiSwitchChain(wagmiAdapter.wagmiConfig, { chainId: mainnet.id as any });
    } catch (switchError) {
      if ((switchError as any)?.code === 4001 ||
          (switchError as any)?.name === "UserRejectedRequestError") {
        throw switchError;
      }
      const connector = wagmiAdapter.wagmiConfig.connectors.find(
        (candidate: any) => candidate.id === "walletConnect" || candidate.type === "walletConnect",
      );
      const eip1193 = await (connector as any)?.getProvider?.() as Eip1193Provider | undefined;
      if (!eip1193) throw switchError;
      await switchEip1193Provider(eip1193);
    }
    saveReownChain(mainnet.id);
    store.switchChain(mainnet.id);
    return;
  }

  const injected = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) {
    throw new Error("No switchable EVM wallet was found. Open this page in your wallet or reconnect with WalletConnect.");
  }
  await switchEip1193Provider(injected);
  store.switchChain(mainnet.id);
}
