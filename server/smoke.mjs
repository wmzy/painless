#!/usr/bin/env node
// 冒烟：以 PORT=0 拉起真实 server/index.mts（监听行解析出实际端口），
// 对 API 与静态面逐一打真实 HTTP。静态断言只钉 /ok.txt，dist 有无
// 两种状态下结论一致（index.mts 中 public 静态始终先注册）。
import {spawn} from 'node:child_process';
import {log} from 'node:console';
import process from 'node:process';
import {URL, fileURLToPath} from 'node:url';

const {fetch} = globalThis;

let failures = 0;

function check(name, ok, detail) {
  if (ok) {
    log(`ok - ${name}`);
  } else {
    failures += 1;
    log(`FAIL - ${name}${detail === undefined ? '' : ` (${detail})`}`);
  }
}

function startServer() {
  const entry = fileURLToPath(new URL('./index.mts', import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: {...process.env, PORT: '0'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const url = new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const found = buffer.match(/s200 server listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (found !== null) resolve(`http://127.0.0.1:${found[1]}`);
    });
    child.once('exit', (code) => reject(new Error(`server exited early (code ${code})`)));
    child.once('error', reject);
  });
  return {child, url};
}

async function runChecks(baseUrl) {
  const health = await fetch(`${baseUrl}/api/health`);
  check('GET /api/health → 200', health.status === 200, `status ${health.status}`);
  const healthBody = await health.json();
  check(
    'GET /api/health body {"status":"ok"}',
    JSON.stringify(healthBody) === '{"status":"ok"}',
    `body ${JSON.stringify(healthBody)}`
  );

  const hello = await fetch(`${baseUrl}/api/hello?name=s200`);
  check('GET /api/hello?name=s200 → 200', hello.status === 200, `status ${hello.status}`);
  const helloBody = await hello.json();
  check(
    'GET /api/hello body {"hello":"s200"}',
    JSON.stringify(helloBody) === '{"hello":"s200"}',
    `body ${JSON.stringify(helloBody)}`
  );
  const helloDefault = await fetch(`${baseUrl}/api/hello`);
  const helloDefaultBody = await helloDefault.json();
  check(
    'GET /api/hello default name',
    JSON.stringify(helloDefaultBody) === '{"hello":"painless"}',
    `body ${JSON.stringify(helloDefaultBody)}`
  );

  const payload = {name: 'painless', nested: {count: 2, tags: ['s200', 'starter']}};
  const echo = await fetch(`${baseUrl}/api/echo`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload)
  });
  check('POST /api/echo → 200', echo.status === 200, `status ${echo.status}`);
  const echoBody = await echo.json();
  check(
    'POST /api/echo JSON round-trip',
    JSON.stringify(echoBody) === JSON.stringify(payload),
    `body ${JSON.stringify(echoBody)}`
  );

  const asset = await fetch(`${baseUrl}/ok.txt`);
  check('GET /ok.txt → 200', asset.status === 200, `status ${asset.status}`);
  const assetBody = await asset.text();
  check('GET /ok.txt body ok', assetBody === 'ok', `body ${JSON.stringify(assetBody)}`);
  const assetType = asset.headers.get('content-type') ?? '';
  check(
    'GET /ok.txt content-type text/plain',
    assetType.startsWith('text/plain'),
    `content-type ${assetType}`
  );

  const missing = await fetch(`${baseUrl}/api/nope`);
  check('GET /api/nope → 404', missing.status === 404, `status ${missing.status}`);
  const missingType = missing.headers.get('content-type') ?? '';
  check(
    'GET /api/nope 404 is JSON',
    missingType.startsWith('application/json'),
    `content-type ${missingType}`
  );
  const missingBody = await missing.json();
  check(
    'GET /api/nope 404 body has error',
    typeof missingBody.error === 'string',
    `body ${JSON.stringify(missingBody)}`
  );
}

async function main() {
  const {child, url} = startServer();
  try {
    const baseUrl = await url;
    await runChecks(baseUrl);
  } catch (error) {
    failures += 1;
    log(`FAIL - server startup (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    child.kill('SIGKILL');
  }
  if (failures > 0) {
    log(`smoke failed: ${failures} check(s) failed`);
    process.exit(1);
  }
  log('smoke passed: all checks green');
  process.exit(0);
}

void main();
