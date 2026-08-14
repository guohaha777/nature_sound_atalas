import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Wanwu Sound Spectrum landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /万物声谱/);
  assert.match(html, /SOUND ATLAS · 2026/);
  assert.match(html, /读一张声音日记/);
  assert.match(html, /录一个声音片段/);
  assert.match(html, /homepage-art\/forest\.svg/);
  assert.match(html, /cloud-transparent\.svg/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/);
});

test("server-renders the visual flow skeleton", async () => {
  const captureHtml = await (await render("/cards?entry=diary")).text();
  assert.match(captureHtml, /把纸上的声音读出来/);
  assert.match(captureHtml, /ACT I · 入口选择完成/);
  assert.match(captureHtml, /照片尚未准备好/);

  const worldHtml = await (await render("/world")).text();
  assert.match(worldHtml, /个人声音/);
  assert.match(worldHtml, /班级声音/);

  const composeHtml = await (await render("/compose")).text();
  assert.match(composeHtml, /可选情绪/);
  assert.match(composeHtml, /独立 AI 背景层/);

  const workHtml = await (await render("/works/demo-composition")).text();
  assert.match(workHtml, /正在打开作品归档/);
  assert.doesNotMatch(workHtml, /06 \/ 06/);
});

test("keeps placeholder data isolated from the route page", async () => {
  const [mockData, homeMockData, home, packageJson] = await Promise.all([
    readFile(new URL("../src/mocks/mockData.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/mocks/homePageMockData.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(mockData, /MOCK_SOUND_CARDS/);
  assert.match(mockData, /MOCK_POLISH_RESULT/);
  assert.match(homeMockData, /HOME_PAGE_MOCK/);
  assert.doesNotMatch(home, /屋檐下的雨|远处的牛|自行车铃|放学的脚步/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
