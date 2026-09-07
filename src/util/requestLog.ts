// dev-only 请求日志环形缓冲：http.ts 的 withLogging 推入事件，DevTool 面板订阅。
// msg ∈ Request|Response|Error；data 含 url/method 或 url/status/duration 或 url/error/duration。
import * as ee from '@for-fun/event-emitter';

export type HttpRequestLog = {
  id: number;
  at: number;
  msg: string;
  data: unknown;
};

// 保留最近条数：面板一次能回看一轮典型交互即可
const MAX_LOGS = 40;

const emitter = ee.create<['change', []]>();

let logs: HttpRequestLog[] = [];
let nextId = 0;

export function pushRequestLog(msg: string, data: unknown): void {
  logs = [{id: nextId++, at: Date.now(), msg, data}, ...logs].slice(
    0,
    MAX_LOGS
  );
  ee.emit(emitter, 'change');
}

export function getRequestLogs(): HttpRequestLog[] {
  return logs;
}

export function clearRequestLogs(): void {
  logs = [];
  ee.emit(emitter, 'change');
}

export function onRequestLogsChange(cb: () => void): () => void {
  return ee.on(emitter, 'change', cb);
}
