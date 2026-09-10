import {describe, it, expect} from 'vitest';

import {sanitizeMarkdown} from './markdown';

// 安全边界契约：非代码区的原始 HTML 剥除，围栏代码块整体保留（渲染器
// 侧转义），markdown 语法本身不受影响。
describe('sanitizeMarkdown', () => {
  it('strips raw script tags and their event payloads', () => {
    expect(
      sanitizeMarkdown('Hello <script>alert(1)</script> world')
    ).toBe('Hello alert(1) world');
  });

  it('strips tags with attributes (event handlers included)', () => {
    expect(
      sanitizeMarkdown('<img src=x onerror=alert(1)> <a href="https://x">x</a>')
    ).toBe(' x');
  });

  it('preserves fenced code blocks verbatim, including tags inside them', () => {
    const md = '```js\nconst el = "<div>";\n```';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  it('preserves markdown syntax and plain text', () => {
    const md = '## Title\n\n**bold** and *em* and `inline`\n\n> quote';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  it('handles unterminated fences by stripping tags in the fallback text', () => {
    expect(sanitizeMarkdown('```js\nconst a = 1;\n\n<b>tail</b>')).toBe(
      '```js\nconst a = 1;\n\ntail'
    );
  });
});
