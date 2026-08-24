// HomeSkeleton（'/' 路由 pendingComponent）的渲染冒烟：验证骨架张数与
// 卡片占位结构。haze-ui 在 vitest 的 ESM 环境下无法提供命名导出
// （见 Home/index.test.tsx 同款注释），mock 为带语义标签的最小 stub。
// pendingComponent 的完整链路（冷启动才显示）依赖路由器运行时，浏览器
// 验证，此处只锁组件本身的可渲染形状。
import type {ReactNode} from 'react';

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';

vi.mock('haze-ui', async () => {
  const React = await import('react');
  const box = (Tag: string, testid: string) => {
    const C = ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) =>
      React.createElement(Tag, {'data-testid': testid, ...rest}, children);
    return C;
  };
  return {
    Card: box('section', 'card'),
    Flex: box('div', 'flex'),
    Skeleton: ({variant, ...rest}: {variant?: string} & Record<string, unknown>) =>
      React.createElement('span', {'data-variant': variant, ...rest})
  };
});

import HomeSkeleton from './Skeleton';

describe('HomeSkeleton', () => {
  it('renders five card placeholders for the cold-start viewport', () => {
    render(<HomeSkeleton />);
    expect(screen.getAllByTestId('card')).toHaveLength(5);
  });

  it('mirrors the article card structure: avatar row, title, body, tags', () => {
    render(<HomeSkeleton />);
    const card = screen.getAllByTestId('card')[0]!;
    const variants = Array.from(card.querySelectorAll('span[data-variant]')).map(
      (el) => el.getAttribute('data-variant')
    );
    // 头像(circular) + 作者名/标题/两行描述(text×3) + 标签(rectangular×2)
    expect(variants).toEqual([
      'circular',
      'text',
      'text',
      'text',
      'text',
      'rectangular',
      'rectangular'
    ]);
  });
});
