// 请求日志缓冲（dev-only）：http.ts 的 withLogging 把每个请求的
// Request/Response/Error 事件推入模块级环形缓冲，DevTool 的请求日志
// 面板订阅展示。生产构建中 http.ts 不接 withLogging（见其 DEV 分支），
// 本模块虽被打进 DevTool chunk（dev-only），无生产调用方。
//
// 形状对齐 fetch-fun withLogging 的 logger(msg, data) 回调：
// msg ∈ 'Request' | 'Response' | 'Error'，data 含 url/method 或
// url/status/duration 或 url/error/duration。
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
