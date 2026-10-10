import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = process.argv[2], only = process.argv[3];
const fonts = "/Users/anthony/Projects/MileClear-tutorial/apps/mobile/assets/fonts";
const ff = [[300,"300Light"],[400,"400Regular"],[500,"500Medium"],[600,"600SemiBold"],[700,"700Bold"],[800,"700Bold"]]
  .map(([w,f]) => `@font-face{font-family:'Plus Jakarta Sans';src:url('file://${fonts}/PlusJakartaSans_${f}.ttf');font-weight:${w}}`).join("\n");
for (const f of readdirSync(dir).filter(f => f.endsWith(".svg") && (!only || f.startsWith(only)))) {
  const html = `<html><head><style>${ff} html,body{margin:0;padding:0;background:#030712}</style></head><body>${readFileSync(`${dir}/${f}`,"utf8")}</body></html>`;
  const tmp = `${process.cwd()}/_r.html`; writeFileSync(tmp, html);
  execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new","--disable-gpu","--hide-scrollbars","--allow-file-access-from-files","--force-device-scale-factor=2","--window-size=390,844",`--screenshot=${dir}/${f.replace(".svg",".png")}`, tmp], { stdio: "ignore" });
  console.log("rendered", f);
}
