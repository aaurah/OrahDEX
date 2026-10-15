# Unified All-Venues Coin and Pair Catalog

## Goal

Expose every usable coin and pair discovered through OrahDEX's native markets, LetsExchange, SimpleSwap, and universal token sources in both Swap and Trade. Keep the default Markets experience fast while providing an explicit **All venues** catalog for full discovery.

## Product Behavior

### Markets

- The existing default Markets view remains limited to curated native spot and futures markets.
- An **All venues** toggle switches to a paginated, server-backed catalog.
- The all-venues view supports symbol search, quote filtering, source filtering, and stable sorting.
- Results identify whether a pair is native, LetsExchange, SimpleSwap, or catalog-discovered.
- Catalog presence means the pair can be selected; it does not guarantee that a provider will quote the requested amount.

### Trade

- Native pairs continue to open in normal order-book mode.
- External-only pairs open the Trade page in swap-routing mode.
- The selected base and quote assets are passed to the existing external quote router.
- If native liquidity later exists for the same pair, native trading remains the preferred default while swap routing stays available.

### Swap

- Input and output selectors use the same normalized all-venues catalog.
- Users can search every imported canonical asset and reverse the selected direction.
- A live estimate queries all configured routing venues before enabling execution.
- The winning provider and alternative quotes remain visible through the existing routing response.

## Architecture

### Unified Catalog API

Extend the markets API with a paginated catalog endpoint or equivalent search mode supporting:

- `scope=default|all`
- `q`
- `quote`
- `sources`
- `limit`
- `offset`

The response returns:

- canonical pair symbol
- canonical base and quote symbols
- display metadata and logo where available
- price and change data where available
- source flags
- native-trading capability
- external-routing capability
- network variants when relevant

Empty all-venues queries return a bounded, ranked page rather than the complete database.

### Catalog Sources

The server merges records in this priority order:

1. Native spot and futures markets
2. LetsExchange live and persisted pairs
3. SimpleSwap live and persisted pairs
4. Universal catalog records

Providers such as ChangeNOW, StealthEX, Changelly, and Swapzone remain quote-on-demand sources unless they expose a reliable full-catalog endpoint already supported by OrahDEX. Their lack of a preloaded pair record must not prevent the live router from checking them after a user selects a pair.

### Normalization and Deduplication

- Canonical symbols are uppercase and stripped of provider-specific network suffixes only through an explicit mapping.
- Network-specific assets remain distinct variants in server metadata.
- UI rows deduplicate by canonical `BASE/QUOTE`.
- Source flags and network variants are merged rather than overwritten.
- Native market data wins for price, volume, and trade capability.
- Provider metadata fills missing logos, network names, memo/tag requirements, and amount bounds.

### Routing

The existing multi-venue quote engine remains the execution authority. It queries LetsExchange, SimpleSwap, ChangeNOW, StealthEX, Changelly, and Swapzone in parallel and selects the best executable quote.

A selected catalog pair is marked:

- **Trade** when native order-book liquidity exists.
- **Swap** when external routing is possible or still needs live validation.
- **Unavailable for amount** when no venue returns an executable quote.

The client must never infer executability from catalog membership.

## Performance and Safety

- Never return or serialize the full multi-million-row catalog in one response.
- All-venues browsing is server-paginated.
- Search is debounced and abortable.
- Queries use indexed base, quote, type, and enabled fields.
- Catalog responses are cached briefly and use stable ordering.
- Default Markets continues excluding large LetsExchange and universal catalog types.
- Pair generation and synchronization remain background operations.
- Provider outages degrade independently and do not erase stale usable catalog data.
- Client-supplied prices are never trusted for order settlement.

## Error Handling

- A failed source contributes a source-level status while successful sources still return results.
- Empty search results distinguish between no match and temporary catalog unavailability.
- Live quote failures identify whether the cause is unsupported pair, amount bounds, missing provider configuration, or provider outage.
- Existing cached pair metadata may be shown during provider outages, but execution remains disabled until a live quote succeeds.

## Validation

- API checks for pagination, source filters, canonical deduplication, and stable ranking.
- Normalization checks cover SimpleSwap network-specific tickers and duplicate symbols.
- Frontend checks cover default/all toggle behavior, search cancellation, source badges, pair selection, and external-only routing.
- Manual preview confirms desktop Markets, mobile selector, Trade, and Swap use the same catalog behavior.

## Scope Boundaries

- This work does not fabricate order books for external-only pairs.
- This work does not precompute every theoretical combination in browser memory.
- This work does not add new provider credentials.
- This work does not change settlement rules or provider fee calculations.