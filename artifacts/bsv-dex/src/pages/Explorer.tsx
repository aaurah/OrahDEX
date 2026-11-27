import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Blocks, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, Clock3, Copy, ExternalLink, Fingerprint, Hash, Layers3,
  Search, ShieldCheck, Waypoints, X,
} from "lucide-react";
import {
  getGetExplorerActivityQueryKey,
  getGetExplorerBlocksQueryKey,
  getGetExplorerAddressHistoryQueryKey,
  getGetExplorerBlockQueryKey,
  getGetExplorerTransactionQueryKey,
  useGetExplorerActivity,
  useGetExplorerAddressHistory,
  useGetExplorerBlock,
  useGetExplorerBlocks,
  useGetExplorerTransaction,
} from "@workspace/api-client-react";
import type { ExplorerActivity, ExplorerBlock } from "@workspace/api-client-react";
import "./Explorer.css";

type LookupKind = "tx" | "block" | "address" | null;

const shortHash = (value: string, head = 12, tail = 8) =>
  value.length > head + tail + 3 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatBsv = (value: number) => `${value.toLocaleString("en-US", { maximumFractionDigits: 8 })} BSV`;
const formatAmount = (value: string) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const whole = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = match[3]?.replace(/0+$/, "");
  return `${match[1]}${whole}${fraction ? `.${fraction}` : ""}`;
};
const privacySafe = (value: string) => value.replace(/[1-9A-HJ-NP-Za-km-z]{26,50}/g, "[address hidden]");
const formatTime = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return "Awaiting timestamp";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return "Awaiting timestamp";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
};
const relativeTime = (value: number | string) => {
  const timestamp = typeof value === "number" ? value * 1000 : new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
const isTxid = (value: string) => /^[a-fA-F0-9]{64}$/.test(value);
const isHeight = (value: string) => /^\d{1,10}$/.test(value);
const isBsvAddress = (value: string) => /^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(value);
const apiErrorStatus = (error: unknown) => {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
};

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="explorer-skeleton-list" aria-label="Loading records">{Array.from({ length: count }, (_, i) => <div className="explorer-skeleton" key={i} />)}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="explorer-empty"><span className="explorer-empty-mark"><Layers3 size={17} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function ErrorState({ onRetry, testId, message = "The data source could not be reached." }: { onRetry: () => void; testId: string; message?: string }) {
  return <div className="explorer-error" role="alert"><CircleAlert size={16} /><span>{message}</span><button type="button" onClick={onRetry} data-testid={testId}>Retry</button></div>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { setCopied(false); }
  };
  return <button type="button" className="explorer-icon-button" aria-label={`Copy ${label}`} data-testid={`button-copy-${label}`} onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>;
}

function BlockRow({ block, selected, onSelect }: { block: ExplorerBlock; selected: boolean; onSelect: (block: ExplorerBlock) => void }) {
  return (
    <button type="button" className={`explorer-block-row ${selected ? "is-selected" : ""}`} data-testid={`button-block-${block.height}`} onClick={() => onSelect(block)}>
      <span className="block-height"><span className="block-cube"><Blocks size={14} /></span><strong>{formatNumber(block.height)}</strong></span>
      <span className="block-hash mono">{shortHash(block.hash)}</span>
      <span className="block-txs"><b>{formatNumber(block.transactionCount)}</b><small>txs</small></span>
      <span className="block-size">{(block.sizeBytes / 1_000_000).toFixed(2)} MB</span>
      <span className="block-age">{relativeTime(block.timestamp)}</span>
      <ChevronRight className="block-chevron" size={15} />
    </button>
  );
}

function ActivityRow({ item, onInspect }: { item: ExplorerActivity; onInspect: (txid: string) => void }) {
  const kind = item.category.toLowerCase();
  const isIncoming = /deposit|receive|buy/.test(kind);
  const safeStatus = privacySafe(item.status);
  return (
    <article className="activity-row" data-testid={`row-exchange-activity-${item.id}`}>
      <span className={`activity-icon ${isIncoming ? "incoming" : "outgoing"}`}>{isIncoming ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span>
      <div className="activity-main">
        <div className="activity-title"><strong>{privacySafe(item.summary)}</strong><span className={`activity-status ${safeStatus.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{safeStatus}</span></div>
        <div className="activity-meta"><span>{privacySafe(item.category)}</span>{item.pair && <><i />{privacySafe(item.pair)}</>}{item.network && <><i />{privacySafe(item.network)}</>}</div>
      </div>
      <div className="activity-value">{item.amount && <strong>{privacySafe(formatAmount(item.amount))}{item.asset ? ` ${privacySafe(item.asset)}` : ""}</strong>}<span>{relativeTime(item.createdAt)}</span></div>
      {item.onChain && item.txid && <button type="button" className="activity-link" onClick={() => onInspect(item.txid!)} aria-label="Inspect public BSV transaction" data-testid={`button-activity-tx-${item.id}`}><ExternalLink size={14} /></button>}
    </article>
  );
}

export function ExplorerPage() {
  const [searchInput, setSearchInput] = useState("");
  const [submittedValue, setSubmittedValue] = useState("");
  const [lookupKind, setLookupKind] = useState<LookupKind>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [blockOffset, setBlockOffset] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [addressToken, setAddressToken] = useState<string | undefined>(undefined);

  const blockParams = useMemo(() => ({ limit: 6 }), []);
  const activityParams = useMemo(() => ({ limit: 8, offset: activityOffset }), [activityOffset]);
  const selectedBlockParams = useMemo(() => ({ limit: 12, offset: blockOffset }), [blockOffset]);
  const addressParams = useMemo(() => ({ limit: 20, ...(addressToken ? { token: addressToken } : {}) }), [addressToken]);

  const blocksQuery = useGetExplorerBlocks(blockParams, {
    query: { refetchInterval: 120_000, queryKey: getGetExplorerBlocksQueryKey(blockParams) },
  });
  const activityQuery = useGetExplorerActivity(activityParams, {
    query: { refetchInterval: 30_000, queryKey: getGetExplorerActivityQueryKey(activityParams) },
  });
  const blockQuery = useGetExplorerBlock(selectedBlock ?? 0, selectedBlockParams, {
    query: { enabled: selectedBlock !== null, queryKey: getGetExplorerBlockQueryKey(selectedBlock ?? 0, selectedBlockParams) },
  });
  const transactionQuery = useGetExplorerTransaction(lookupKind === "tx" ? submittedValue : "", {
    query: { enabled: lookupKind === "tx" && isTxid(submittedValue), queryKey: getGetExplorerTransactionQueryKey(lookupKind === "tx" ? submittedValue : "") },
  });
  const addressQuery = useGetExplorerAddressHistory(lookupKind === "address" ? submittedValue : "", addressParams, {
    query: { enabled: lookupKind === "address" && isBsvAddress(submittedValue), queryKey: getGetExplorerAddressHistoryQueryKey(lookupKind === "address" ? submittedValue : "", addressParams) },
  });

  const response = blocksQuery.data;
  const networkName = response?.network.toLowerCase().includes("test") ? "TESTNET" : "MAINNET";
  const blocks = response?.blocks ?? [];
  const activity = activityQuery.data?.items ?? [];
  const lookupError = lookupKind === "tx" ? transactionQuery.isError : lookupKind === "address" ? addressQuery.isError : false;
  const lookupFailure = lookupKind === "tx" ? transactionQuery.error : addressQuery.error;
  const lookupErrorMessage = apiErrorStatus(lookupFailure) === 404 ? "No matching BSV record was found." : undefined;
  const lookupLoading = lookupKind === "tx" ? transactionQuery.isLoading : lookupKind === "address" ? addressQuery.isLoading : false;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchInput.trim();
    setSubmittedValue(value);
    setAddressToken(undefined);
    if (isTxid(value)) {
      setLookupKind("tx");
      setSelectedBlock(null);
    } else if (isHeight(value)) {
      setLookupKind("block");
      setSelectedBlock(Number(value));
      setBlockOffset(0);
    } else if (isBsvAddress(value)) {
      setLookupKind("address");
      setSelectedBlock(null);
    } else {
      setLookupKind(null);
      setSelectedBlock(null);
    }
  };

  const clearLookup = () => {
    setSearchInput("");
    setSubmittedValue("");
    setLookupKind(null);
    setSelectedBlock(null);
    setAddressToken(undefined);
  };

  const selectedBlockTitle = selectedBlock !== null ? `Block ${formatNumber(selectedBlock)}` : "";
  const addressHistory = addressQuery.data;
  const tx = transactionQuery.data;

  return (
    <main className="explorer-page" data-testid="page-bsv-explorer">
      <div className="explorer-frame">
        <header className="explorer-header">
          <div className="explorer-brand-lockup">
            <div className="explorer-brand-mark"><Waypoints size={19} strokeWidth={1.8} /></div>
            <div><span className="eyebrow">ORAHDEX / NETWORK TOOLS</span><h1>Chain explorer</h1></div>
          </div>
          <div className="network-status" data-testid="status-bsv-network">
            <span className="status-pulse" />
             <div><strong>BSV {networkName.toLowerCase()}</strong><small>{response?.network ?? "Public chain"}</small></div>
            <span className="network-separator" />
            <div className="network-tip"><small>CHAIN TIP</small><strong>{response ? formatNumber(response.tipHeight) : "—"}</strong></div>
          </div>
        </header>

        <section className="explorer-search-area" aria-label="Search public BSV records">
          <div className="search-intro">
            <div className="search-kicker"><Fingerprint size={14} /> PUBLIC BSV LEDGER</div>
            <h2>Find a record.<br /><em>Follow it on-chain.</em></h2>
            <p>Search a transaction ID, block height, or Base58 BSV address.</p>
          </div>
          <form className="explorer-search" onSubmit={handleSearch} data-testid="form-explorer-search">
            <Search size={18} className="search-leading" />
            <label className="sr-only" htmlFor="explorer-query">Transaction ID, block height, or BSV address</label>
            <input id="explorer-query" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="64-character tx ID, block height, or address" autoComplete="off" data-testid="input-explorer-search" />
            {searchInput && <button type="button" className="search-clear" onClick={() => { setSearchInput(""); }} aria-label="Clear search" data-testid="button-clear-search"><X size={15} /></button>}
            <button type="submit" className="search-submit" data-testid="button-submit-search">Inspect <ChevronRight size={16} /></button>
          </form>
          <div className="search-footnote"><span><ShieldCheck size={13} /> Read-only lookup</span><span>Powered by WhatsOnChain</span></div>
        </section>

        {submittedValue && !lookupKind && <div className="lookup-notice" role="alert" data-testid="status-invalid-search"><CircleAlert size={16} /><span>That format is not recognized. Use a 64-character transaction ID, a block height, or a Base58 BSV address.</span><button type="button" onClick={clearLookup} aria-label="Dismiss" data-testid="button-dismiss-invalid-search"><X size={15} /></button></div>}

        {(lookupKind === "tx" || lookupKind === "address") && (
          <section className="lookup-panel" aria-live="polite" data-testid="section-lookup-results">
            <div className="section-heading lookup-heading">
              <div><div className="section-label"><Hash size={14} /> LOOKUP RESULT</div><h2>{lookupKind === "tx" ? "Transaction" : "Address history"}</h2></div>
              <button className="text-button" type="button" onClick={clearLookup} data-testid="button-close-lookup"><X size={15} /> Close</button>
            </div>
            {lookupLoading ? <LoadingRows count={3} /> : lookupError ? <ErrorState testId="button-retry-lookup" message={lookupErrorMessage} onRetry={() => lookupKind === "tx" ? void transactionQuery.refetch() : void addressQuery.refetch()} /> : lookupKind === "tx" && tx ? (
              <div className="tx-detail">
                <div className="tx-id-line"><span className="mono">{tx.txid}</span><CopyButton value={tx.txid} label="transaction-id" /><a href={tx.explorerUrl} target="_blank" rel="noreferrer" className="detail-external" data-testid="link-transaction-whats-on-chain"><ExternalLink size={14} /> WhatsOnChain</a></div>
                <div className="tx-facts">
                  <div><small>STATUS</small><strong>{tx.confirmations > 0 ? `${formatNumber(tx.confirmations)} confirmations` : "Unconfirmed"}</strong></div>
                  <div><small>BLOCK HEIGHT</small><strong>{tx.blockHeight === null ? "Not yet mined" : formatNumber(tx.blockHeight)}</strong></div>
                  <div><small>TIME</small><strong>{formatTime(tx.timestamp)}</strong></div>
                  <div><small>SIZE</small><strong>{formatNumber(tx.sizeBytes)} bytes</strong></div>
                  <div><small>TOTAL OUTPUT</small><strong>{formatBsv(tx.totalOutputBsv)}</strong></div>
                </div>
                <div className="flow-columns">
                  <div className="flow-side"><div className="flow-label"><ArrowDownLeft size={14} /> INPUTS <span>{tx.inputs.length}</span></div>{tx.inputs.map((input, index) => <div className="io-record" key={`${input.txid ?? "coinbase"}-${index}`}><strong className="mono">{input.coinbase ? "Coinbase" : shortHash(input.txid ?? "Unknown input", 14, 8)}</strong><span>{input.outputIndex === null ? "Newly issued" : `Output index ${input.outputIndex}`}</span></div>)}</div>
                  <div className="flow-divider"><ChevronRight size={17} /></div>
                  <div className="flow-side"><div className="flow-label"><ArrowUpRight size={14} /> OUTPUTS <span>{tx.outputs.length}</span></div>{tx.outputs.map((output) => <div className="io-record" key={output.index}><strong>{formatBsv(output.valueBsv)}</strong><span>{output.type ?? `Output ${output.index + 1}`}</span></div>)}</div>
                </div>
              </div>
            ) : lookupKind === "address" && addressHistory ? (
              <div className="address-result">
                <div className="address-id-line"><span className="mono">{addressHistory.address}</span><CopyButton value={addressHistory.address} label="address" /><span className="provider-chip">SOURCE · {addressHistory.source}</span></div>
                {addressHistory.items.length ? <div className="address-list">{addressHistory.items.map((item, index) => <div className="address-record" key={`${item.txid}-${index}`}><Hash size={14} /><span className="mono">{shortHash(item.txid, 18, 12)}</span><strong>{item.blockHeight === null ? "Unconfirmed" : `Block ${formatNumber(item.blockHeight)}`}</strong><button type="button" className="text-button" onClick={() => { setSubmittedValue(item.txid); setSearchInput(item.txid); setLookupKind("tx"); }} data-testid={`button-open-address-tx-${index}`}>Inspect <ChevronRight size={13} /></button></div>)}</div> : <EmptyState title="No history returned" detail="No confirmed transactions were included in this address response." />}
                {addressHistory.nextToken && <button type="button" className="load-more-button" onClick={() => setAddressToken(addressHistory.nextToken ?? undefined)} data-testid="button-address-load-more">Load older transactions <ChevronDown size={14} /></button>}
              </div>
            ) : !lookupLoading && !lookupError ? <EmptyState title="No record found" detail="The provider returned no result for this lookup." /> : null}
          </section>
        )}

        <div className="explorer-content-grid">
          <section className="panel blocks-panel" aria-labelledby="blocks-heading">
            <div className="section-heading">
              <div><div className="section-label"><Blocks size={14} /> CHAIN ACTIVITY</div><h2 id="blocks-heading">Recent blocks <span className="live-tag"><i /> LIVE</span></h2></div>
              <div className="panel-meta"><span className="source-dot" />WhatsOnChain</div>
            </div>
            {blocksQuery.isLoading ? <LoadingRows count={6} /> : blocksQuery.isError ? <ErrorState testId="button-retry-blocks" onRetry={() => void blocksQuery.refetch()} /> : blocks.length ? (
              <div className="blocks-list">
                <div className="block-table-head"><span>HEIGHT</span><span>BLOCK HASH</span><span>TX COUNT</span><span>SIZE</span><span>AGE</span></div>
                {blocks.map((block) => <BlockRow key={block.hash} block={block} selected={selectedBlock === block.height} onSelect={(item) => { setSelectedBlock(selectedBlock === item.height ? null : item.height); setBlockOffset(0); setLookupKind(null); }} />)}
              </div>
            ) : <EmptyState title="No recent blocks" detail="Recent block records will appear here when available." />}
            <div className="panel-footnote"><span>Chain data supplied by WhatsOnChain</span>{response?.updatedAt && <span>Updated {formatTime(response.updatedAt)}</span>}</div>
          </section>

          <section className={`panel block-detail-panel ${selectedBlock !== null ? "detail-open" : ""}`} aria-labelledby="detail-heading">
            {selectedBlock === null ? (
              <div className="detail-prompt"><div className="detail-orbit"><Blocks size={22} /></div><div className="section-label">BLOCK INSPECTOR</div><h2 id="detail-heading">Select a block</h2><p>Choose any row to inspect its public metadata and transaction IDs.</p><div className="detail-rule"><span /><span /><span /></div></div>
            ) : (
              <>
                <div className="section-heading detail-title">
                  <div><div className="section-label"><Layers3 size={14} /> BLOCK INSPECTOR</div><h2 id="detail-heading">{selectedBlockTitle}</h2></div>
                  <button className="explorer-icon-button" type="button" aria-label="Close block inspector" onClick={() => setSelectedBlock(null)} data-testid="button-close-block-detail"><X size={15} /></button>
                </div>
                 {blockQuery.isLoading ? <LoadingRows count={4} /> : blockQuery.isError ? <ErrorState testId="button-retry-block-detail" message={apiErrorStatus(blockQuery.error) === 404 ? "No BSV block exists at this height." : undefined} onRetry={() => void blockQuery.refetch()} /> : blockQuery.data ? (
                  <div className="block-inspection">
                    <div className="block-inspection-facts">
                      <div><small>CONFIRMATIONS</small><strong>{formatNumber(blockQuery.data.block.confirmations)}</strong></div>
                      <div><small>MINER</small><strong>{blockQuery.data.block.miner ?? "Not identified"}</strong></div>
                      <div><small>MINED</small><strong>{formatTime(blockQuery.data.block.timestamp)}</strong></div>
                      <div className="inspection-hash"><small>BLOCK HASH</small><strong className="mono">{shortHash(blockQuery.data.block.hash, 18, 12)}</strong><CopyButton value={blockQuery.data.block.hash} label="block-hash" /></div>
                    </div>
                    <div className="tx-list-heading"><span>TRANSACTION IDS</span><strong>{formatNumber(blockQuery.data.totalTransactions)} total</strong></div>
                    <div className="block-tx-list">{blockQuery.data.transactions.map((txid, index) => <button type="button" key={`${txid}-${index}`} className="block-tx-row" onClick={() => { setSubmittedValue(txid); setSearchInput(txid); setLookupKind("tx"); setSelectedBlock(null); }} data-testid={`button-block-tx-${index}`}><span className="tx-index">{String(blockQuery.data!.offset + index + 1).padStart(2, "0")}</span><span className="mono">{shortHash(txid, 15, 10)}</span><ChevronRight size={14} /></button>)}</div>
                    {blockQuery.data.hasMore && <button type="button" className="load-more-button" onClick={() => setBlockOffset((offset) => offset + (blockQuery.data?.limit ?? 12))} data-testid="button-block-load-more">More transaction IDs <ChevronDown size={14} /></button>}
                    {!blockQuery.data.transactions.length && <EmptyState title="No transaction IDs" detail="This block response contains no transaction IDs." />}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>

        <section className="panel exchange-panel" aria-labelledby="activity-heading">
          <div className="section-heading activity-section-heading">
            <div><div className="section-label"><Waypoints size={14} /> ORAHDEX / STORED ACTIVITY</div><h2 id="activity-heading">OrahDEX activity <span className="record-count">{activityQuery.data?.items.length ?? 0} records</span></h2></div>
            <div className="activity-caption"><ShieldCheck size={15} /><span>Wallet addresses are never shown</span></div>
          </div>
          <div className="activity-disclosure" data-testid="text-activity-disclosure"><CircleAlert size={14} /><p>These are records stored by OrahDEX. Open orders and internal activity are not confirmed blockchain transactions; only entries with a transaction ID can be verified on-chain. This is not a complete event audit.</p></div>
          {activityQuery.isLoading ? <LoadingRows count={4} /> : activityQuery.isError ? <ErrorState testId="button-retry-activity" onRetry={() => void activityQuery.refetch()} /> : activity.length ? (
            <>
              <div className="activity-list">{activity.map((item) => <ActivityRow key={item.id} item={item} onInspect={(txid) => { setSubmittedValue(txid); setSearchInput(txid); setLookupKind("tx"); setSelectedBlock(null); }} />)}</div>
              <div className="activity-pagination">
                <span>Showing {activityOffset + 1}–{activityOffset + activity.length} latest records</span>
                <div><button type="button" aria-label="Previous activity page" disabled={activityOffset === 0} onClick={() => setActivityOffset(Math.max(0, activityOffset - (activityQuery.data?.limit ?? 8)))} data-testid="button-activity-previous"><ChevronLeft size={16} /></button><button type="button" aria-label="Next activity page" disabled={!activityQuery.data?.hasMore} onClick={() => setActivityOffset(activityOffset + (activityQuery.data?.limit ?? 8))} data-testid="button-activity-next"><ChevronRight size={16} /></button></div>
              </div>
            </>
          ) : <EmptyState title="No public activity yet" detail="Public-safe exchange records will appear here when available." />}
        </section>

        <footer className="explorer-footer"><span><span className="footer-mark">O</span> ORAHDEX EXPLORER</span><span><Clock3 size={13} /> Public chain data · Read-only</span><span>BSV / {networkName}</span></footer>
      </div>
    </main>
  );
}
