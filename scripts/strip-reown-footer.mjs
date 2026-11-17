import { execSync } from "node:child_process";
import { writeFileSync, cpSync, existsSync } from "node:fs";

const out = execSync(
  `find node_modules/.pnpm -path '*wui-ux-by-reown/index.js' -not -name '*.map' 2>/dev/null | head -1`,
  { encoding: "utf8" }
).trim();

if (!out) {
  console.log("[strip-reown-footer] component not found, skipping");
  process.exit(0);
}

const STUB = `import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
let WuiUxByReown = class WuiUxByReown extends LitElement {
  render() {
    return html\`\`;
  }
};
WuiUxByReown = customElement("wui-ux-by-reown")(WuiUxByReown);
export { WuiUxByReown };
`;

if (!existsSync(out + ".bak")) cpSync(out, out + ".bak");
writeFileSync(out, STUB);
console.log("[strip-reown-footer] gutted:", out);
