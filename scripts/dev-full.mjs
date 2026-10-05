#!/usr/bin/env node
// 全栈开发：pnpm start（vite，:5173）+ node --watch server/index.mts（:4300）。
// 输出去色加前缀直通；Ctrl-C / 任一子进程退出 → 组信号双杀（detached
// 进程组保证 pnpm 之下的 vite 等孙进程一并收到 SIGINT），等两子进程
// 退净后沿用首个退出者的退出码退出，10s 兜底防挂死。兜底定时器只在
// firstExit 里武装：unref 只让定时器「不维持」事件循环，而子进程
// stdio 管道会维持——顶层武装等于运行 10s 自杀并孤儿化两个子进程。
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import process from 'node:process';

const ANSI = /\x1B\[[0-9;?]*[A-Za-z]/g;

function pipePrefixed(tag, source, sink) {
  const lines = createInterface({input: source});
  lines.on('line', (line) => sink.write(`${tag} ${line.replace(ANSI, '')}\n`));
}

const children = [];

function launch(tag, command, args, env = {}) {
  const child = spawn(command, args, {
    env: {...process.env, ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  pipePrefixed(`[${tag}]`, child.stdout, process.stdout);
  pipePrefixed(`[${tag}]`, child.stderr, process.stderr);
  children.push(child);
  return child;
}

launch('vite', 'pnpm', ['start']);
launch('s200', process.execPath, ['--watch', 'server/index.mts'], {PORT: '4300'});

let settled = false;
const closed = new Set();

function firstExit(code) {
  if (settled) return;
  settled = true;
  // 子进程被信号杀死时 exit 事件的 code 为 null——按失败计，不掩盖崩溃。
  process.exitCode = code ?? 1;
  killAll();
  setTimeout(() => {
    for (const child of children) {
      if (!closed.has(child)) child.kill('SIGKILL');
    }
    process.exit(process.exitCode ?? 1);
  }, 10000).unref();
}

function killAll() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      child.kill('SIGINT');
    }
  }
}

for (const child of children) {
  child.on('exit', (code) => firstExit(code));
  child.on('close', () => {
    closed.add(child);
    if (closed.size === children.length) process.exit(process.exitCode ?? 0);
  });
}

process.on('SIGINT', () => firstExit(0));
