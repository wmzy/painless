// 文章正文的 markdown 渲染安全边界：RealWorld API 的 article.body 是
// 用户生成的 markdown，渲染走 haze-ui MarkdownRenderer（正则子集解析，
// dangerouslySetInnerHTML 注入），其转义只覆盖围栏代码块——普通文本段
// 的原始 HTML（<script>/onerror/内联标签）会被原样注入。本函数在解析
// 前剥离非代码区的原始 HTML 标签：围栏块（``` … ```）整体保留（渲染器
// 会自行转义），其余位置的 <tag> 一律删除——攻击面随标签消失，正文的
// markdown 结构（标题/强调/列表/引用）不受影响。
//
// 取舍：链接/图片语法渲染器本就不支持，剥离 <a>/<img> 原始标签没有
// 额外内容损失；围栏内的 <div> 等示例代码完整保留。
const FENCE_OR_TAG = /(```[\s\S]*?```)|(<\/?[a-zA-Z][^>]*>)/g;

export function sanitizeMarkdown(md: string): string {
  return md.replace(FENCE_OR_TAG, (_match, fence: string | undefined) => fence ?? '');
}
