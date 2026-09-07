// RealWorld 错误契约唯一解析点：http 文案与表单回填共用（decisions.md #22）。
export type ApiFieldErrors = Record<string, string[]>;

type ParsedApiError = {
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
      const list = Array.isArray(messages) ? messages : [messages];
      const strings = list.filter((m): m is string => typeof m === 'string');
      if (strings.length) fieldErrors[field] = strings;
    }
    if (Object.keys(fieldErrors).length) result.fieldErrors = fieldErrors;
  }
  return result;
}
