// RealWorld 非 2xx 错误契约（{message} 或 {errors: {field: string[]}}）的唯一解析点：
// http 文案与表单字段回填共用（decisions.md #22）。零依赖，方向恒为消费者 → 本模块。

// 字段级 errors：键为字段名，值为 string 列表（单值归一为数组，非字符串丢弃）。
export type ApiFieldErrors = Record<string, string[]>;

// 缺省即无：message/fieldErrors 仅在对应内容存在时出现（空记录以 undefined 表达）。
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
      // 兼容单值：非字符串丢弃，全弃的字段不落键
      const list = Array.isArray(messages) ? messages : [messages];
      const strings = list.filter((m): m is string => typeof m === 'string');
      if (strings.length) fieldErrors[field] = strings;
    }
    if (Object.keys(fieldErrors).length) result.fieldErrors = fieldErrors;
  }
  return result;
}
