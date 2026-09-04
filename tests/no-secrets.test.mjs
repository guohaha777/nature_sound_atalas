import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * 决赛验收项：不能有密钥进入浏览器代码、仓库或日志。
 *
 * 这里检查的是构建产物：只要 .env.local 里的任何一个密钥值出现在下发到浏览器的文件里，
 * 就立刻失败。断言信息只写变量名，绝不打印密钥本身。
 */
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
/** 值短于这个长度的环境变量不参与比对，避免把普通词误判成密钥。 */
const MIN_SECRET_LENGTH = 12;
const SECRET_NAME_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD)$/;

async function readSecrets() {
  const raw = await readFile(path.join(projectRoot, ".env.local"), "utf8").catch(() => null);
  if (raw === null) return [];
  return raw.split("\n").flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) return [];
    const [, name, value] = match;
    const secret = value.trim().replace(/^["']|["']$/g, "");
    if (!SECRET_NAME_PATTERN.test(name) || secret.length < MIN_SECRET_LENGTH) return [];
    return [{ name, secret }];
  });
}

async function collectFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(target, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [target] : [];
  }));
  return files.flat();
}

async function directoryExists(directory) {
  return stat(directory).then((entry) => entry.isDirectory()).catch(() => false);
}

test("no API key from .env.local reaches the browser bundle", async (t) => {
  const secrets = await readSecrets();
  if (secrets.length === 0) {
    t.skip("没有配置任何密钥，跳过泄漏检查");
    return;
  }

  const bundleDirectories = [
    path.join(projectRoot, "dist", "client"),
    path.join(projectRoot, ".next", "static"),
  ].filter(Boolean);

  let scanned = 0;
  for (const directory of bundleDirectories) {
    if (!await directoryExists(directory)) continue;
    const files = await collectFiles(directory, [".js", ".mjs", ".css", ".html", ".json", ".map"]);
    for (const file of files) {
      const content = await readFile(file, "utf8").catch(() => "");
      scanned += 1;
      for (const { name, secret } of secrets) {
        assert.equal(
          content.includes(secret),
          false,
          `${name} 的值出现在下发给浏览器的文件里：${path.relative(projectRoot, file)}`,
        );
      }
    }
  }

  assert.ok(scanned > 0, "没有找到任何构建产物可供检查，请先运行构建");
});

test("env files stay out of the repository", async () => {
  const gitignore = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
  assert.match(gitignore, /^\.env\*$/m, ".gitignore 必须忽略所有 .env 文件");
  assert.match(gitignore, /^!\.env\.example$/m, "示例文件应保持可提交");

  const example = await readFile(path.join(projectRoot, ".env.example"), "utf8");
  const filled = example.split("\n").filter((line) => {
    const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
    return match && SECRET_NAME_PATTERN.test(match[1]) && match[2].trim().length >= MIN_SECRET_LENGTH;
  });
  assert.deepEqual(filled, [], ".env.example 里不能填入真实密钥");
});
