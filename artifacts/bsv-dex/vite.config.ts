import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Resolve the vite-plugin-node-polyfills package directory so we can return
// absolute paths to shim files, bypassing Rolldown's broken conditions check
// for the deprecated trailing-slash exports pattern.
const _require = createRequire(import.meta.url);
const _polyfillsPkgDir = path.resolve(
  path.dirname(_require.resolve("vite-plugin-node-polyfills")),
  "..",
);

// PORT is only needed for the dev/preview server, not the production build.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

// Accept VITE_REOWN_PROJECT_ID or the bare REOWN_PROJECT_ID so both naming
// conventions work (Replit secrets often omit the VITE_ prefix).
const reownProjectId =
  process.env.VITE_REOWN_PROJECT_ID ||
  process.env.REOWN_PROJECT_ID ||
  "04663615251cf13fb1b043d754e7a17f";
if (!reownProjectId) {
  console.warn(
    "[OrahDEX] VITE_REOWN_PROJECT_ID is not set — WalletConnect will not work. " +
    "Add this secret and rebuild."
  );
}

export default defineConfig({
  base: basePath,
  optimizeDeps: {
    include: ["jsqr"],
    exclude: [
      "gridplus-sdk",
      "@trezor/connect-web",
      "@keystonehq/bc-ur-registry-eth",
    ],
  },
  define: {
    'import.meta.env.VITE_REOWN_PROJECT_ID': JSON.stringify(reownProjectId),
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE ?? ''),
    'import.meta.env.VITE_THIRDWEB_CLIENT_ID': JSON.stringify(process.env.VITE_THIRDWEB_CLIENT_ID ?? ''),
  },
  plugins: [
    // ─────────────────────────────────────────────────────────────────────────
    // Self-healing symlinker: pnpm install --frozen-lockfile wipes any manually
    // created symlinks in artifacts/bsv-dex/node_modules. This buildStart hook
    // re-creates the required symlinks before every build so the process is
    // idempotent regardless of workflow restarts.
    {
      name: "bsv-dex-symlinks",
      buildStart() {
        const bsvNm = path.resolve(import.meta.dirname, "node_modules");
        const pnpmRoot = path.resolve(import.meta.dirname, "../../node_modules/.pnpm");
        if (!fs.existsSync(pnpmRoot)) return;
        const pnpmEntries = fs.readdirSync(pnpmRoot);

        function findEntry(pkgName: string, versionHint = "") {
          const safe = pkgName.replace(/^@/, "").replace("/", "+");
          const candidates = pnpmEntries.filter(e => e.startsWith(safe + "@"));
          if (!candidates.length) return null;
          if (versionHint) {
            // versionHint is a plain version prefix like "2.21.1" or "2.21" or "1.8"
            const match = candidates.find(c => {
              const ver = c.slice(safe.length + 1).split("_")[0];
              return ver === versionHint || ver.startsWith(versionHint + ".");
            });
            if (match) return match;
          }
          return candidates[0];
        }

        function ensureLink(pkgName: string, entry: string) {
          const dest = path.join(bsvNm, pkgName);
          if (fs.existsSync(dest)) return;
          const src = path.join(pnpmRoot, entry, "node_modules", pkgName);
          if (!fs.existsSync(src)) return;
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.symlinkSync(src, dest);
        }

        // Packages that must be present but are often wiped by pnpm install
        const REQUIRED: Record<string, string> = {
          "@reown/appkit": "1.8",
          "@reown/appkit-utils": "1.8",
          "@reown/appkit-scaffold-ui": "1.8",
          "@reown/appkit-ui": "1.8",
          "@reown/appkit-wallet": "1.8",
          "@reown/appkit-controllers": "1.8",
          "@reown/appkit-common": "1.8",
          "@reown/appkit-polyfills": "1.8",
          "@reown/appkit-pay": "1.8",
          "@reown/appkit-adapter-wagmi": "1.8",
          "@walletconnect/universal-provider": "2.21",
          "@walletconnect/sign-client": "2.21.1",
          "@walletconnect/core": "2.21.1",
          "@walletconnect/web3wallet": "1.",
          "@wagmi/core": "3.",
          "@wagmi/connectors": "8.",
          "wagmi": "3.",
          "viem": "2.",
          "framer-motion": "12.",
          "gridplus-sdk": "4.",
          "@ledgerhq/device-management-kit": "1.",
          "@ledgerhq/device-signer-kit-ethereum": "1.",
          "@ledgerhq/device-transport-kit-web-hid": "1.",
          "@ledgerhq/context-module": "1.",
          "@trezor/connect-web": "9.",
          "big.js": "6.",
          "bs58": "4.",
          "dayjs": "1.",
          "eventemitter3": "5.",
          "semver": "5.",
          "use-sync-external-store": "1.",
          "valtio": "1.",
        };

        for (const [pkg, hint] of Object.entries(REQUIRED)) {
          const entry = findEntry(pkg, hint);
          if (entry) ensureLink(pkg, entry);
        }
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // @walletconnect/logger compat: logger@2 (used by sign-client@2.21.1) has
    // a getLoggerContext that calls `e.bindings()` as a function.  AppKit
    // creates its root logger via logger@3 which has pino@10 *inlined* in its
    // dist — pino@10 sets `child.bindings = bindingsObject` (plain object, not
    // a function).  When AppKit passes that pino-v10 logger to our symlinked
    // universal-provider@2.21.1, logger@2's getLoggerContext crashes.  We
    // transform logger@2's dist at build time so that getLoggerContext handles
    // both a function bindings() and a plain-object bindings.
    {
      name: "walletconnect-logger-compat",
      enforce: "pre",
      transform(code: string, id: string) {
        if (!id.includes("@walletconnect/logger") || !id.includes("2.1.2")) return null;
        // logger@2 getLoggerContext:
        //   typeof r.bindings>"u" ? t=v(r,e) : t=r.bindings().context||""
        // Fix: also handle plain-object bindings (from pino v10 child loggers).
        const OLD = `typeof r.bindings>"u"?t=v(r,e):t=r.bindings().context||""`;
        const NEW = `typeof r.bindings>"u"?t=v(r,e):t=(typeof r.bindings==="function"?r.bindings().context:(r.bindings&&r.bindings.context))||""`;
        if (!code.includes(OLD)) return null;
        return { code: code.replace(OLD, NEW), map: null };
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // pnpm-chain redirect: @reown/* and @walletconnect/universal-provider live
    // ONLY in artifacts/bsv-dex/node_modules (symlinked).  Any pnpm-store
    // importer (ThirdWeb 1.7.8 chain, etc.) can't reach them through normal
    // node_modules traversal.  We intercept those imports and re-resolve from
    // bsv-dex's own src/main.tsx context so rolldown sees the symlinked copy.
    {
      name: "bsv-dex-redirect",
      enforce: "pre",
      async resolveId(id: string, importer: string | undefined) {
        // Only act when the importer is inside the pnpm store (not our own src)
        if (!importer || !importer.includes("/node_modules/")) return null;
        // Don't double-intercept our own virtual modules
        if (id.startsWith("\0")) return null;

        const REDIRECT_PKGS = new Set([
          "@reown/appkit",
          "@reown/appkit-utils",
          "@reown/appkit-scaffold-ui",
          "@reown/appkit-ui",
          "@reown/appkit-wallet",
          "@reown/appkit-controllers",
          "@reown/appkit-common",
          "@reown/appkit-polyfills",
          "@reown/appkit-pay",
          "@reown/appkit-adapter-wagmi",
          "@walletconnect/universal-provider",
        ]);

        const pkgName = id.startsWith("@")
          ? id.split("/").slice(0, 2).join("/")
          : id.split("/")[0];

        if (!REDIRECT_PKGS.has(pkgName)) return null;

        // Check the package actually exists in bsv-dex
        const bsvNm = path.resolve(import.meta.dirname, "node_modules");
        if (!fs.existsSync(path.join(bsvNm, pkgName))) return null;

        // Re-resolve from bsv-dex context so rolldown picks up package exports
        try {
          const fakeImporter = path.resolve(import.meta.dirname, "src/main.tsx");
          const resolved = await this.resolve(id, fakeImporter, { skipSelf: true });
          if (resolved) return resolved;
        } catch {
          // fall through — let rolldown try or let other plugins stub it
        }
        return null;
      },
    },

    // ThirdWeb's built-in UI components import @emotion/styled and siblings, but
    // those packages are not present in this pnpm virtual store (broken CAS
    // entries). We stub them with minimal no-op implementations so rolldown can
    // resolve every import. ThirdWeb's headless hooks work fine; the only
    // casualty is ThirdWeb's own styled-component UI, which we don't use.
    {
      name: "thirdweb-ui-shim",
      enforce: "pre",
      async resolveId(id: string, importer: string | undefined) {
        // ── 1. Explicit stubs: @emotion and ThirdWeb UI-only deps ──────────
        // @emotion/* packages are resolved directly from ThirdWeb's own pnpm
        // dependency tree (thirdweb@*/node_modules/@emotion/) — no stub needed.
        if (
          id === "@radix-ui/react-icons" ||
          id === "fuse.js" ||
          id === "uqr"
        ) {
          return "\0emotion-stub:" + id;
        }
        // ── 2. ThirdWeb optional platform / server-side deps (explicit stubs) ──
        const TW_OPTIONAL = new Set([
          "@aws-sdk/client-kms",
          "@aws-sdk/client-lambda",
          "@aws-sdk/credential-providers",
          "@base-org/account",
          "@coinbase/wallet-sdk",
          "@passwordless-id/webauthn",
          "@react-native-async-storage/async-storage",
          "@thirdweb-dev/engine",
          "@thirdweb/extensions/common",
          "cross-spawn",
          "expo-web-browser",
          "express",
          "open",
          "ora",
          "prompts",
          "react-native",
          "react-native-aes-gcm-crypto",
          "react-native-passkey",
          "react-native-quick-crypto",
          "react-native-svg",
          "toml",
          "uint8array-extras",
          "x402-hono",
          "x402/types",
        ]);
        if (TW_OPTIONAL.has(id)) return "\0tw-opt-stub:" + id;
        // ── 3. Catch-all for ThirdWeb's OWN internal dist ──────────────────
        // ThirdWeb lives in a pnpm CAS entry and can't see packages symlinked
        // into artifacts/bsv-dex/node_modules.  When the importer is inside
        // thirdweb_tmp_10452 we re-resolve the import from bsv-dex's context
        // (using a fake importer inside bsv-dex/src), or stub it if it's truly
        // unavailable.
        const isThirdwebImporter = !!(importer && (
          importer.includes("thirdweb_tmp_10452") ||
          /\/node_modules\/\.pnpm\/thirdweb@/.test(importer)
        ));
        if (
          isThirdwebImporter &&
          !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0") &&
          !id.startsWith("react") && !id.startsWith("node:") && !id.startsWith("viem")
        ) {
          const pkgName = id.startsWith("@")
            ? id.split("/").slice(0, 2).join("/")
            : id.split("/")[0];
          const bsvNm = path.resolve(import.meta.dirname, "node_modules");
          if (fs.existsSync(path.join(bsvNm, pkgName))) {
            // Package IS in bsv-dex — try to re-resolve from bsv-dex context.
            // If this.resolve() throws (e.g. for subpath exports that rolldown
            // handles natively), return null so rolldown handles it itself.
            try {
              const fakeImporter = path.resolve(
                import.meta.dirname,
                "src/main.tsx",
              );
              const resolved = await this.resolve(id, fakeImporter, {
                skipSelf: true,
              });
              if (resolved) return resolved;
            } catch {
              // let rolldown resolve it from its own chain
            }
            return null;
          }
          // Package not in bsv-dex — return importer-aware stub
          const imp = importer.replace(/\0/g, "").replace(/\|/g, "%7C");
          return "\0tw-catchall:" + imp + "|" + id;
        }
        return null;
      },
      load(id: string) {
        // Intercept pino loaded from the pnpm store (any version) by absolute path.
        // Rolldown pre-resolves bare "pino" specifiers to their absolute pnpm-store
        // path BEFORE alias matching, so the resolve.alias for "pino" only catches
        // some importers. We must also intercept at the load stage by path.
        // pino v10 browser.js sets `this.bindings = obj` (plain object on child
        // loggers) but @walletconnect/logger@3.0.2 calls `e.bindings()` expecting a
        // function — our stub fixes this by always exposing bindings() as a method.
        if (!id.startsWith("\0") && id.includes("/node_modules/pino/")) {
          return fs.readFileSync(
            path.resolve(import.meta.dirname, "src/stubs/pino.js"),
            "utf-8",
          );
        }
        if (!id.startsWith("\0emotion-stub:")) return null;
        const pkg = id.replace("\0emotion-stub:", "");
        if (pkg === "@emotion/styled") {
          return `
import React from 'react';
const NO_OP_CSS = () => '';
// Proxy-based @emotion/styled stub.
// ThirdWeb v5 calls styled components in many patterns:
//   styled.button\`...\`          → tag from property name
//   styled(Component)\`...\`     → tag from call arg
//   Component.withComponent('a') → new tag
//   Component(props)             → render (direct function call, no JSX)
// A Proxy intercepts all of these uniformly without needing to enumerate patterns.
function makeStyledProxy(tag) {
  // The proxy wraps a plain function so typeof proxy === 'function' passes.
  const fn = function styledFn(first, ...rest) {
    // Tagged template literal: first arg is an array of strings
    if (Array.isArray(first)) {
      return makeStyledProxy(tag);
    }
    if (first == null) return makeStyledProxy(tag);
    if (typeof first === 'function') {
      // styled(SomeComponent) — function component
      return makeStyledProxy(first);
    }
    if (typeof first === 'object') {
      // Distinguish React special objects (forwardRef, memo, context, etc.)
      // from plain render-props objects by checking $$typeof / render / type.
      if (first.$$typeof != null || first.render != null || first.type != null) {
        // React special object acting as a component → new template proxy
        return makeStyledProxy(first);
      }
      // Plain props object → render call
      const { children, ...others } = first;
      const clean = {};
      for (const k in others) { if (k[0] !== '$') clean[k] = others[k]; }
      const t = (typeof tag === 'string' || typeof tag === 'function' || (tag && typeof tag === 'object')) ? tag : 'div';
      return React.createElement(t, clean, children);
    }
    // String (HTML tag name): styled('div')
    return makeStyledProxy(first);
  };
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === 'displayName') return 'styled.' + (typeof tag === 'string' ? tag : (tag && tag.displayName) || '?');
      if (prop === '__emotion_base' || prop === '__emotion_styles') return tag;
      if (prop === '__emotion_forwardProp') return undefined;
      if (prop === 'toString') return () => '';
      if (typeof prop === 'symbol') return undefined;
      // attrs / withConfig / extend → return a function that produces another proxy (same tag)
      if (prop === 'attrs' || prop === 'withConfig' || prop === 'extend') return (_a) => makeStyledProxy(tag);
      // withComponent → new proxy wrapping the new tag
      if (prop === 'withComponent') return (newTag) => makeStyledProxy(newTag);
      // CRITICAL: return the real fn.prototype so React's class-component check
      // (typeof Component.prototype.render === 'function') sees 'undefined', not
      // another proxy-function.  Without this, React treats every styled proxy as
      // a class component and crashes with "a.render is not a function".
      if (prop === 'prototype') return fn.prototype;
      // HTML tag shorthand: styled.button → proxy for 'button'
      return makeStyledProxy(prop);
    },
  });
}
const styled = makeStyledProxy('div');
export default styled;
export const css = NO_OP_CSS;
export const keyframes = NO_OP_CSS;
export const Global = () => null;
export const ClassNames = ({ children }) => children({ css: NO_OP_CSS, cx: (...args) => args.filter(Boolean).join(' ') });
export const ThemeContext = React.createContext({});
export const ThemeProvider = ({ children }) => children;
export const withTheme = (C) => C;
export const useTheme = () => ({});
export const injectGlobal = NO_OP_CSS;
`;
        }
        if (pkg === "@emotion/react") {
          return `
import React from 'react';
export const css = () => '';
export const keyframes = () => '';
export const Global = () => null;
export const ClassNames = ({ children }) => children({ css: () => '', cx: (...a) => a.filter(Boolean).join(' ') });
export const ThemeContext = React.createContext({});
export const ThemeProvider = ({ children }) => children;
export const withTheme = (C) => C;
export const useTheme = () => ({});
export const jsx = React.createElement;
export const CacheProvider = ({ children }) => children;
export const serializeStyles = () => ({ name: '', styles: '' });
export default { css, keyframes, Global, ClassNames, ThemeContext, ThemeProvider, withTheme, useTheme, jsx, CacheProvider };
`;
        }
        if (pkg === "@emotion/cache") {
          return `export default function createCache(opts) { return { key: (opts && opts.key) || 'css', inserted: {}, global: {}, registered: {}, sheet: { insert: () => {} } }; }`;
        }
        if (pkg === "@emotion/hash") {
          return `export default function murmur2(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; } return Math.abs(h).toString(36); }`;
        }
        if (pkg === "@emotion/memoize") {
          return `export default function memoize(fn) { const cache = new Map(); return (arg) => { if (!cache.has(arg)) cache.set(arg, fn(arg)); return cache.get(arg); }; }`;
        }
        if (pkg === "@emotion/weak-memoize") {
          return `export default function weakMemoize(fn) { const cache = new WeakMap(); return (arg) => { if (!cache.has(arg)) cache.set(arg, fn(arg)); return cache.get(arg); }; }`;
        }
        if (pkg === "@emotion/is-prop-valid") {
          const validProps = new Set('children,dangerouslySetInnerHTML,key,ref,autoFocus,defaultChecked,defaultValue,suppressContentEditableWarning,suppressHydrationWarning,accessKey,className,contentEditable,contextMenu,dir,draggable,hidden,id,lang,placeholder,slot,spellCheck,style,tabIndex,title,translate,role,about,datatype,inlist,prefix,property,resource,typeof,vocab,autoCapitalize,autoCorrect,autoSave,color,inert,itemProp,itemScope,itemType,itemID,itemRef,results,security,unselectable,inputMode,is,radioGroup,async,autoComplete,autoPlay,capture,cellPadding,cellSpacing,charSet,classID,cols,colSpan,content,controls,controlsList,coords,crossOrigin,data,dateTime,default,defer,disabled,download,encType,form,formAction,formEncType,formMethod,formNoValidate,formTarget,frameBorder,headers,height,high,href,hrefLang,htmlFor,httpEquiv,integrity,keyParams,keyType,kind,label,list,loop,low,manifest,marginHeight,marginWidth,max,maxLength,media,mediaGroup,method,min,minLength,multiple,muted,name,nonce,noValidate,open,optimum,pattern,ping,poster,preload,profile,readOnly,referrerPolicy,rel,required,reversed,rows,rowSpan,sandbox,scope,scoped,scrolling,seamless,selected,shape,size,sizes,span,src,srcDoc,srcLang,srcSet,start,step,summary,target,type,useMap,value,width,wmode,wrap'.split(','));
          return `export default function isPropValid(prop) { return (${JSON.stringify(Array.from(validProps))}).includes(prop) || !prop.startsWith('on') && !/[A-Z]/.test(prop.slice(1)); }`;
        }
        if (pkg === "@emotion/use-insertion-effect-with-fallbacks") {
          return `
import { useLayoutEffect, useEffect } from 'react';
export const useInsertionEffectWithLayoutFallback = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
export const useInsertionEffectAlwaysWithSyncFallback = typeof document !== 'undefined' ? useLayoutEffect : useEffect;
`;
        }
        if (pkg === "@radix-ui/react-icons") {
          return `
import React from 'react';
const Icon = React.forwardRef(function Icon(_p, _r) { return null; });
export const ArrowDownIcon = Icon;
export const ArrowRightIcon = Icon;
export const CheckCircledIcon = Icon;
export const CheckIcon = Icon;
export const ChevronDownIcon = Icon;
export const ChevronLeftIcon = Icon;
export const ChevronRightIcon = Icon;
export const ClockIcon = Icon;
export const CopyIcon = Icon;
export const CopyIconasCopyIconSVG = Icon;
export const Cross1Icon = Icon;
export const Cross2Icon = Icon;
export const CrossCircledIcon = Icon;
export const ExitIcon = Icon;
export const ExternalLinkIcon = Icon;
export const MagnifyingGlassIcon = Icon;
export const MinusIcon = Icon;
export const PaperPlaneIcon = Icon;
export const PinBottomIcon = Icon;
export const PlusIcon = Icon;
export const RadiobuttonIcon = Icon;
export const ReloadIcon = Icon;
export const ShuffleIcon = Icon;
export const TextAlignJustifyIcon = Icon;
`;
        }
        if (pkg === "fuse.js") {
          return `
export default class Fuse {
  constructor(list, _opts) { this._list = list || []; }
  search(pattern) {
    const p = pattern.toLowerCase();
    return this._list
      .filter(item => JSON.stringify(item).toLowerCase().includes(p))
      .map(item => ({ item, refIndex: 0, score: 0.5 }));
  }
  setCollection(list) { this._list = list; }
  static createIndex(keys, list) { return {}; }
}
`;
        }
        if (pkg === "uqr") {
          return `export function encode(data, opts) { return { size: 0, data: '' }; }`;
        }
        return `export default {}; export const css = () => ''; export const serialize = () => ({ name: '', styles: '' });`;
      },
    },
    {
      name: "thirdweb-opt-stub",
      enforce: "pre",
      load(id: string) {
        if (!id.startsWith("\0tw-opt-stub:")) return null;
        const pkg = id.replace("\0tw-opt-stub:", "");
        // AWS SDK stubs
        if (pkg === "@aws-sdk/client-kms") {
          return `export class KMSClient { constructor(){} send(){return Promise.resolve({}); } }
export class GenerateDataKeyCommand { constructor(i){this.input=i;} }`;
        }
        if (pkg === "@aws-sdk/client-lambda") {
          return `export class LambdaClient { constructor(){} send(){return Promise.resolve({}); } }
export class InvokeCommand { constructor(i){this.input=i;} }`;
        }
        if (pkg === "@aws-sdk/credential-providers") {
          return `export const fromCognitoIdentity = () => async () => ({ accessKeyId:'', secretAccessKey:'' });
export const fromCognitoIdentityPool = () => async () => ({ accessKeyId:'', secretAccessKey:'' });`;
        }
        // Coinbase Wallet SDK
        if (pkg === "@coinbase/wallet-sdk") {
          return `export default class CoinbaseWalletSDK {
  constructor(_o){} makeWeb3Provider(){ return { request: ()=>Promise.reject(new Error('Coinbase Wallet not available')), on:()=>{}, removeListener:()=>{} }; }
}
export { CoinbaseWalletSDK };`;
        }
        // WebAuthn
        if (pkg === "@passwordless-id/webauthn") {
          return `export const client = { isAvailable:()=>false, register:()=>Promise.reject(), authenticate:()=>Promise.reject() };
export const parsers = { parseAuthentication:()=>({}), parseRegistration:()=>({}) };`;
        }
        // React Native async storage
        if (pkg === "@react-native-async-storage/async-storage") {
          return `export default { getItem:()=>Promise.resolve(null), setItem:()=>Promise.resolve(), removeItem:()=>Promise.resolve(), clear:()=>Promise.resolve() };`;
        }
        // ThirdWeb engine
        if (pkg === "@thirdweb-dev/engine") {
          const noop = `() => Promise.resolve({})`;
          return `export const createAccount=${noop};
export const listAccounts=${noop};
export const sendTransaction=${noop};
export const signMessage=${noop};
export const signTypedData=${noop};
export const searchTransactions=${noop};
export const isSuccessResponse=()=>false;`;
        }
        // @walletconnect/sign-client — real package is symlinked; no stub needed
        // pino — used by @walletconnect/logger.  Pino v7 browser mode stores
        // child bindings as `this.bindings = obj` (a plain object), but
        // @walletconnect/logger@2.1.2 calls `logger.bindings()` as a function.
        // Provide a thin stub where bindings() is always a callable method.
        if (pkg === "pino") {
          return `
const LEVELS = {
  values: {trace:10,debug:20,info:30,warn:40,error:50,fatal:60,silent:Infinity},
  labels: {10:'trace',20:'debug',30:'info',40:'warn',50:'error',60:'fatal'},
};
function makeLogger(opts, storedBindings) {
  opts = opts || {};
  storedBindings = storedBindings || {};
  const lvl = opts.level || 'info';
  const write = opts.browser && opts.browser.write;
  const logger = {
    level: lvl,
    levels: LEVELS,
    pino: '7.11.0',
    bindings() { return Object.assign({}, storedBindings); },
    child(b) { return makeLogger(opts, Object.assign({}, storedBindings, b)); },
    isLevelEnabled() { return false; },
    flush(cb) { if (cb) cb(); },
    trace() {}, debug() {}, silent() {},
    info(...a)  { if (write) write(JSON.stringify({level:30,...storedBindings,...(typeof a[0]==='object'?a[0]:{}),msg:typeof a[0]==='string'?a[0]:a[1]||'',time:Date.now()})); },
    warn(...a)  { console.warn('[WC]',...a); if (write) write(JSON.stringify({level:40,...storedBindings,msg:typeof a[0]==='string'?a[0]:a[1]||'',time:Date.now()})); },
    error(...a) { console.error('[WC]',...a); if (write) write(JSON.stringify({level:50,...storedBindings,msg:typeof a[0]==='string'?a[0]:a[1]||'',time:Date.now()})); },
    fatal(...a) { console.error('[WC fatal]',...a); },
  };
  return logger;
}
const pino = function(opts, s) { return makeLogger(opts); };
pino.levels = LEVELS;
pino.version = '7.11.0';
export default pino;
export const levels = LEVELS;
`;
        }
        // Node.js CLI tools — no-op in browser
        if (pkg === "cross-spawn") {
          return `export const spawn = () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}} });`;
        }
        if (pkg === "open")  return `export default async () => {};`;
        if (pkg === "ora")   return `export default () => ({ start(){ return this; }, succeed(){ return this; }, fail(){ return this; }, stop(){ return this; } });`;
        if (pkg === "prompts") return `export default async () => ({});`;
        // React Native
        if (pkg === "react-native" || pkg.startsWith("react-native-") || pkg === "react-native-svg") {
          return `export default {}; export const Platform={OS:'web',select:(o)=>o.web||o.default}; export const StyleSheet={create:(s)=>s}; export const View=()=>null; export const Text=()=>null; export const TouchableOpacity=()=>null; export const Image=()=>null; export const TextInput=()=>null; export const ScrollView=()=>null; export const SafeAreaView=()=>null;`;
        }
        // TOML parser
        if (pkg === "toml") {
          return `export function parse(str){ try{ return JSON.parse(str); }catch{ return {}; } }`;
        }
        // x402 payment protocol types (zod schemas) — stubs with .parse passthrough
        if (pkg === "x402/types") {
          const schema = `{ parse:(v)=>v, safeParse:(v)=>({success:true,data:v}), optional:()=>schema }`;
          return `const schema = ${schema};
export const EvmNetworkToChainId = {};
export const PaymentPayloadSchema = schema;
export const PaymentRequirementsSchema = schema;
export const SettleResponseSchema = schema;
export const SupportedPaymentKindsResponseSchema = schema;
export const VerifyResponseSchema = schema;`;
        }
        // ethers — minimal stub (ThirdWeb uses viem internally; ethers imports are legacy codepaths)
        if (pkg === "ethers") {
          return `export const ethers = {}; export const providers = {}; export const Contract = class{}; export const Wallet = class{}; export const utils = {}; export const BigNumber = { from:()=>({}) }; export default { ethers:{}, providers:{}, Contract:class{}, Wallet:class{}, utils:{}, BigNumber:{from:()=>({})} };`;
        }
        // expo-web-browser
        if (pkg === "expo-web-browser") {
          return `export const openAuthSessionAsync = async () => ({ type:'cancel' }); export const openBrowserAsync = async () => {}; export const dismissBrowser = () => {}; export default { openAuthSessionAsync, openBrowserAsync, dismissBrowser };`;
        }
        // @base-org/account — dynamic import only, needs createBaseAccountSDK
        if (pkg === "@base-org/account") {
          return `export const createBaseAccountSDK = () => ({ connect:()=>Promise.reject(new Error('Base Account not available')), getAccount:()=>null }); export default { createBaseAccountSDK };`;
        }
        // uint8array-extras
        if (pkg === "uint8array-extras") {
          return `
export const areUint8ArraysEqual = (a, b) => { if (a.length !== b.length) return false; for (let i=0;i<a.length;i++) if (a[i]!==b[i]) return false; return true; };
export const assertUint8Array = (v) => { if (!(v instanceof Uint8Array)) throw new TypeError('Expected Uint8Array'); };
export const isUint8Array = (v) => v instanceof Uint8Array;
export const uint8ArrayToString = (a) => new TextDecoder().decode(a);
export const base64ToString = (s) => atob(s);
export const base64ToUint8Array = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
`;
        }
        // express — stub for server-side framework
        if (pkg === "express") {
          return `const app = () => { const a = { get:()=>a, post:()=>a, use:()=>a, listen:()=>({close:()=>{}}) }; return a; }; app.Router = () => ({ get:()=>{}, post:()=>{}, use:()=>{} }); export default app;`;
        }
        // x402-hono payment middleware
        if (pkg === "x402-hono") {
          return `export const paymentMiddleware = () => async (_c, next) => next();`;
        }
        // @thirdweb/extensions/common
        if (pkg === "@thirdweb/extensions/common") {
          return `export const setContractMetadata = () => ({ to:'', data:'0x' });`;
        }
        return `export default {};`;
      },
    },
    {
      name: "thirdweb-catchall-stub",
      enforce: "pre",
      load(id: string) {
        if (!id.startsWith("\0tw-catchall:")) return null;
        // ID format: \0tw-catchall:IMPORTER_PATH|PKG_ID
        const rest = id.slice("\0tw-catchall:".length);
        const sepIdx = rest.lastIndexOf("|");
        const importerPath = sepIdx >= 0 ? rest.slice(0, sepIdx) : "";
        const pkg = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest;

        // Discover named exports from the importer file
        const names = new Set<string>();
        if (importerPath && fs.existsSync(importerPath)) {
          try {
            const text = fs.readFileSync(importerPath, "utf-8");
            const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const importRe = new RegExp(
              `from\\s*["']${escapedPkg}["']`,
              "g",
            );
            let m;
            while ((m = importRe.exec(text)) !== null) {
              const start = text.lastIndexOf("import", m.index);
              const chunk = text.slice(start, m.index + m[0].length);
              const namedM = chunk.match(/\{([^}]+)\}/);
              if (namedM) {
                for (const raw of namedM[1].split(",")) {
                  const n = raw.trim().split(/\s+as\s+/)[0].trim();
                  if (n && /^[A-Za-z_$]/.test(n)) names.add(n);
                }
              }
            }
          } catch (_) { /* ignore */ }
        }

        const lines = ["export default {};"];
        for (const n of names) {
          // Produce a reasonable no-op for each name
          const isClass = n[0] === n[0].toUpperCase();
          lines.push(
            isClass
              ? `export class ${n} { constructor(){} static init(){ return Promise.resolve(new ${n}()); } }`
              : `export const ${n} = () => {};`,
          );
        }
        return lines.join("\n");
      },
    },
    // Rolldown (Vite 8) strips ".js" from subpath specifiers when looking up
    // the package exports map. "@noble/curves" v2.x exports ONLY ".js" keys
    // (e.g. "./secp256k1.js"), so Rolldown can't find them (looks for
    // "./secp256k1" without .js). This plugin intercepts extensionless
    // @noble/curves/* and @noble/hashes/* imports, checks the exports map,
    // and if there is no extensionless key (v2.x), resolves the .js file
    // by absolute path — bypassing the broken exports map lookup entirely.
    // v1.x packages have extensionless keys and are left alone.
    // Rolldown (Vite 8) fails to resolve vite-plugin-node-polyfills shim
    // imports: its conditions check ["module","browser","production","require"]
    // stops at "production" (not in the shim's {"require":...,"import":...}
    // value) instead of continuing to "require". Also handles the deprecated
    // trailing-slash folder export pattern ("./shims/buffer/") that Rolldown
    // doesn't support. Bypass both issues by returning the absolute ESM path.
    {
      name: "polyfills-shims-compat",
      enforce: "pre",
      resolveId(id: string) {
        const m = id.match(
          /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)\/?$/,
        );
        if (!m) return null;
        return path.join(_polyfillsPkgDir, `shims/${m[1]}/dist/index.js`);
      },
    },
    {
      name: "noble-pkg-compat",
      enforce: "pre",
      async resolveId(id: string, importer: string | undefined) {
        if (!importer) return null;
        const match = id.match(/^(@noble\/(curves|hashes))\/([^./]+)$/);
        if (!match) return null;
        const pkg = match[1];
        const subpath = match[3];

        // Resolve the package main entry relative to the importer so we get
        // the correct nested version (not necessarily the workspace root).
        const pkgMain = await this.resolve(pkg, importer, { skipSelf: true });
        if (!pkgMain) return null;

        // Walk up to find the node_modules/<pkg> directory.
        const pkgMarker = `/node_modules/${pkg}/`;
        const markerIdx = pkgMain.id.lastIndexOf(pkgMarker);
        if (markerIdx === -1) return null;
        const pkgDir = pkgMain.id.slice(0, markerIdx + pkgMarker.length - 1);

        // Read the exports map and check for an extensionless key.
        let pkgExports: Record<string, unknown> = {};
        try {
          const raw = fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8");
          pkgExports = JSON.parse(raw).exports ?? {};
        } catch {
          return null;
        }

        // If the extensionless key exists, let Rolldown handle it normally.
        if (pkgExports[`./${subpath}`]) return null;

        // No extensionless key (v2.x) — resolve the .js file by absolute path
        // so Rolldown never touches the exports map for this import.
        const jsFile = path.join(pkgDir, `${subpath}.js`);
        if (!fs.existsSync(jsFile)) return null;
        return { id: jsFile };
      },
    },
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      // pino is used by @walletconnect/logger. Pino's browser bundle stores
      // child bindings as a plain object (this.bindings = obj) but
      // @walletconnect/logger@2.1.2 calls logger.bindings() as a function.
      // Alias to our stub that always has bindings() as a callable method.
      "pino": path.resolve(import.meta.dirname, "src/stubs/pino.js"),
      // Rolldown (Vite 8) cannot resolve @reown/appkit subpath exports through
      // symlinks created by bsv-dex-symlinks buildStart. Point directly to the
      // dist files so rolldown never needs to follow the symlink for subpaths.
      "@reown/appkit/react":    path.resolve(import.meta.dirname, "node_modules/@reown/appkit/dist/esm/exports/react.js"),
      "@reown/appkit/networks": path.resolve(import.meta.dirname, "node_modules/@reown/appkit/dist/esm/exports/networks.js"),
      // @emotion/react is aliased to a standalone stub to prevent Rolldown from
      // deriving the same "import_react" namespace identifier for both `react`
      // and `@emotion/react` (both end in "react"). Without this alias, the
      // real @emotion/react package (symlinked in bsv-dex/node_modules) causes
      // a namespace collision where ThirdWeb's `keyframes` call resolves to
      // React's namespace (where it is undefined) → TypeError on app load.
      "@emotion/react":   path.resolve(import.meta.dirname, "src/stubs/emotion-react.js"),
      "@emotion/styled":  path.resolve(import.meta.dirname, "src/stubs/emotion-styled.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    /* Let Rolldown do automatic code splitting — manualChunks was causing
       the entry chunk to statically import 4 MB of JS (modals + pages chunks),
       blocking the app from mounting on mobile. */
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INVALID_ANNOTATION") return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          // Core React runtime — always tiny, loads first
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // Routing + query
          if (id.includes("node_modules/@tanstack/") || id.includes("node_modules/wouter/")) {
            return "vendor-query";
          }
          // Chart library — heavy, only needed on trading pages
          if (id.includes("node_modules/lightweight-charts") || id.includes("node_modules/fancy-canvas")) {
            return "vendor-charts";
          }
          // Crypto / wallet libs — heavy, only needed on wallet pages
          if (
            id.includes("node_modules/@noble/") ||
            id.includes("node_modules/@scure/") ||
            id.includes("node_modules/bigi") ||
            id.includes("node_modules/bs58") ||
            id.includes("node_modules/ecpair") ||
            id.includes("node_modules/tiny-secp256k1")
          ) {
            return "vendor-crypto";
          }
          // UI component library
          if (id.includes("node_modules/@radix-ui/") || id.includes("node_modules/lucide-react")) {
            return "vendor-ui";
          }
          // Reown / WalletConnect — only needed when wallet modal opens
          if (id.includes("node_modules/@reown/") || id.includes("node_modules/@walletconnect/") || id.includes("node_modules/viem/") || id.includes("node_modules/wagmi/")) {
            return "vendor-walletconnect";
          }
          // Everything else in node_modules stays in a shared vendor chunk
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  clearScreen: false,
  logLevel: "info",
});
