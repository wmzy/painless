// RealWorld 非 2xx 错误契约（{message} 或 {errors: {field: string[]}}）
// 的唯一解析点。此前 http.ts 的 errorText（把错误体拼成一句可读文案）与
// validators.ts 的 fieldErrorsOf（归一错误对象的字段级 errors）是同一
// 契约的两份手写实现，任何一处口径漂移就是 http message 与表单字段
// 回填对同一响应各说各话；下沉到这里后两边只做各自的呈现/分流。
// 零依赖：不 import http / react-f0rm / services，方向恒为消费者 →
// 本模块（validators.ts 的「表单工具不耦合具体 HTTP 库」约束因此保持）。

// 归一后的字段级 errors：键为字段名，值为纯 string 列表（单条 string
// 已包成数组，非字符串条目已丢弃）。
export type ApiFieldErrors = Record<string, string[]>;

// 解析结果按「缺省即无」表达：message 仅在后端给了非空字符串时出现
// （给了整句就不必拆字段）；fieldErrors 仅在 errors 形状成立且至少
// 落下一个字段时出现——空记录以 undefined 表达，调用方免判空对象。
export type ParsedApiError = {
  message?: string;
  fieldErrors?: ApiFieldErrors;
};

export function parseApiError(data: unknown): ParsedApiError {
  const body = data as {message?: unknown; errors?: unknown} | undefined | null;
  const result: ParsedApiError = {};
  if (typeof body?.message === 'string' && body.message) {
    result.message = body.message;
  }
  const raw = body?.errors;
  if (raw && typeof raw === 'object') {
    const fieldErrors: ApiFieldErrors = {};
    for (const [field, messages] of Object.entries(raw)) {
      // 契约是 string[]，但兼容单值形状；非字符串条目丢弃，全弃的
      // 字段不落键
      const list = Array.isArray(messages) ? messages : [messages];
      const strings = list.filter((m): m is string => typeof m === 'string');
      if (strings.length) fieldErrors[field] = strings;
    }
    if (Object.keys(fieldErrors).length) result.fieldErrors = fieldErrors;
  }
  return result;
}
