// Backfill synthetic intraday candles from existing daily candles.
// Deterministic (same output every run), deletes + regenerates intraday rows only.
// Daily/weekly/monthly candles are never touched.
import pg from 'pg';
import fs from 'node:fs';

// ── Tunables ──────────────────────────────────────────────
const SYMBOLS       = 60;                                  // top markets by volume
const DAYS_BY_MIN   = { 240:120, 120:120, 60:120, 30:120, 15:60, 5:14, 3:7, 1:3 };

// ── Load DATABASE_URL from .env ───────────────────────────
const envFile = new URL('./.env', import.meta.url);
const envText = fs.readFileSync(envFile, 'utf8');
const dbUrl   = (envText.match(/^DATABASE_URL="(.+)"$/m) ?? [])[1];
if (!dbUrl) { console.error('DATABASE_URL not found in .env'); process.exit(1); }

const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
const q = (sql, params=[]) => pool.query(sql, params);

// ── Detect candles table shape ────────────────────────────
const colRows = (await q(`SELECT column_name, data_type FROM information_schema.columns
                          WHERE table_name='candles' ORDER BY ordinal_position`)).rows;
const col = (...pats) => colRows.find(c => pats.some(p => c.column_name.toLowerCase().includes(p)))?.column_name;
const C = {
  symbol:   col('symbol','pair','market'),
  interval: col('interval','timeframe','resolution'),
  time:     col('open_time','opentime','time','ts','timestamp','date'),
  open:     col('open'),  high: col('high'), low: col('low'), close: col('close'),
  volume:   col('base_volume','basevol','volume','vol','amount'),
};
for (const [k,v] of Object.entries(C)) if (!v) { console.error(`Cannot detect candles.${k} column. Found:`, colRows.map(r=>r.column_name)); process.exit(1); }

const isTs   = ['timestamp without time zone','timestamp with time zone','date'].includes(
                colRows.find(r=>r.column_name===C.time).data_type);
const allIntervals = (await q(`SELECT "${C.interval}" iv, count(*) n FROM candles GROUP BY 1 ORDER BY 2 DESC`)).rows;
console.log('intervals in DB:', allIntervals.map(r=>`${r.iv}:${r.n}`).join(' '));

// minute-count -> actual DB label (match what the app writes)
const labelFor = new Map();
for (const { iv } of allIntervals) {
  const m = String(iv).trim().toLowerCase();
  const num = parseInt(m);
  let mins = null;
  if (/^d(ay)?/.test(m)) mins = 1440;
  else if (/^w/.test(m)) mins = 10080;
  else if (m.endsWith('m') && !isNaN(num)) mins = num;
  else if (m.endsWith('h') && !isNaN(num)) mins = num * 60;
  else if (m.endsWith('d') && !isNaN(num)) mins = num * 1440;
  else if (!isNaN(num) && num >= 60) mins = num;          // bare minutes e.g. '60'
  if (mins && DAYS_BY_MIN[mins] !== undefined && !labelFor.has(mins)) labelFor.set(mins, iv);
}
if (labelFor.size === 0) { console.error('No intraday intervals found in DB'); process.exit(1); }
console.log('backfilling:', [...labelFor].map(m=>`${m}m as '${labelFor.get(m)}'`).join(', '));

const dailyLabel = allIntervals.find(r => ['1d','d','day','1day','1440','D'].includes(String(r.iv).toLowerCase()))?.iv
                 ?? allIntervals.find(r => parseInt(String(r.iv)) === 1440)?.iv;
if (!dailyLabel) { console.error('No daily candles found to derive from'); process.exit(1); }
console.log('source interval:', dailyLabel);

// ── Helpers ───────────────────────────────────────────────
function hash32(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const t0 = Date.now();
let inserted = 0, symbolsDone = 0;

// top symbols by daily volume
const symRows = (await q(
  `SELECT "${C.symbol}" s, sum("${C.volume}"::numeric) v FROM candles
   WHERE "${C.interval}"=$1 GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT $2`,
  [dailyLabel, SYMBOLS])).rows;

await q(`CREATE INDEX IF NOT EXISTS candles_bf_idx ON candles("${C.symbol}","${C.interval}")`);

for (const { s: symbol } of symRows) {
  const days = (await q(
    `SELECT "${C.time}" t, "${C.open}"::float8 o, "${C.high}"::float8 h,
            "${C.low}"::float8 l, "${C.close}"::float8 c, "${C.volume}"::float8 v
     FROM candles WHERE "${C.symbol}"=$1 AND "${C.interval}"=$2
     ORDER BY "${C.time}" ASC`, [symbol, dailyLabel])).rows;
  if (days.length === 0) continue;

  const intradayLabels = [...labelFor.values()];
  await q(`DELETE FROM candles WHERE "${C.symbol}"=$1 AND "${C.interval}" = ANY($2)`, [symbol, intradayLabels]);

  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const cols = `"${C.symbol}","${C.interval}","${C.time}","${C.open}","${C.high}","${C.low}","${C.close}","${C.volume}"`;
    const chunk = batch.splice(0, 5000);
    const vals = [], args = [];
    chunk.forEach((r,i)=>{ const b=i*8; vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`); args.push(...r); });
    await q(`INSERT INTO candles (${cols}) VALUES ${vals.join(',')}`, args);
    inserted += chunk.length;
  };

  for (const [mins, label] of labelFor) {
    const nPerDay = Math.floor(1440 / mins);
    const maxDays = DAYS_BY_MIN[mins];
    const usable = days.slice(-maxDays);
    for (const d of usable) {
      const seed = hash32(`${symbol}|${Number(d.t)}|${mins}`);
      const rand = rng(seed);
      const dayStart = isTs ? new Date(d.t).getTime() : Number(d.t) * (Number(d.t) < 1e12 ? 1000 : 1);
      const k = 3, phi = rand() * Math.PI * 2;
      const S = (d.h - d.l) / 2 * 0.75;
      const base = f => d.o + (d.c - d.o) * f;
      const wave = f => Math.sin(2 * Math.PI * k * f + phi);
      for (let i = 0; i < nPerDay; i++) {
        const f0 = i / nPerDay, f1 = (i + 1) / nPerDay, fm = (f0 + f1) / 2;
        let o = base(f0) + S * wave(f0);
        let c = base(f1) + S * wave(f1);
        let h = Math.max(o, c, base(fm) + S * wave(fm), Math.min(d.h, Math.max(o, c) + (d.h - d.l) * 0.1));
        let l = Math.min(o, c, base(fm) + S * wave(fm), Math.max(d.l, Math.min(o, c) - (d.h - d.l) * 0.1));
        if (l > h) { const m = (l + h) / 2; l = m; h = m; }
        h = Math.min(h, d.h); l = Math.max(l, d.l);
        const v = (d.v / nPerDay) * (0.4 + rand() * 1.2);
        const ts = isTs ? new Date(dayStart + i * mins * 60000) : Math.floor((dayStart + i * mins * 60000) / 1000);
        batch.push([symbol, label, ts, +o.toFixed(8), +h.toFixed(8), +l.toFixed(8), +c.toFixed(8), +v.toFixed(4)]);
        if (batch.length >= 5000) await flush();
      }
    }
  }
  await flush();
  symbolsDone++;
  if (symbolsDone % 10 === 0) console.log(`${symbolsDone}/${symRows.length} symbols, ${inserted} rows, ${((Date.now()-t0)/1000).toFixed(0)}s`);
}

console.log(`DONE: ${symbolsDone} symbols, ${inserted} intraday candles in ${((Date.now()-t0)/1000).toFixed(0)}s`);
await pool.end();
