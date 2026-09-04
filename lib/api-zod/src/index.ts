export * from "./generated/api";
export * from "./generated/types";
// `generated/api` exports zod *value* schemas (e.g. GetCandlesParams = zod.object)
// while `generated/types` exports same-named static *types*. The two `export *`
// above make those three names ambiguous (TS2308). Re-export the zod schemas
// explicitly so they win the ambiguity — this package's purpose is the runtime
// schemas, and nothing consumes the same-named static types.
export {
  GetCandlesParams,
  GetOrderBookParams,
  GetRecentTradesParams,
} from "./generated/api";
