// 来源：生态评审后置项 #13 —— Tags 侧栏此前只在 Home/index.test.tsx 里以
// vi.mock('./Tags') stub 隔离，隔离理由（「真实 Tags 静态依赖 vite 插件的
// 虚拟模块 '@/types/index.schema'，vitest 管线无法解析」）已陈旧：vitest.
// config.mts 早已注册 rollup-plugin-type-as-json-schema 且 faker.test/
// dataloaders 在用；haze-ui 1.21 dist 纯 ESM + vitest inline 后也可真渲染。
// 本文件 mock '@/services/dataloaders' 的 useTagsQuery（受控 loading/error/
// data/stale/refetch）与 '@native-router/react' 的 useSearch/useSetSearch，
// haze-ui 全真渲染（AsyncSection/TagGroup/Title 产物即库本体），断言锁
// 行为层：tag 点击写 search、active 态 aria-pressed、loading 占位
//（role=status）、error 告警（role=alert）+ Retry 回调，不耦合 DOM 细节。
// 归并建议：Home/index.test.tsx 保留视图编排口径（分页/favorite 链路），
// Tags 的分支与交互断言以本文件为准；若后续 Home 的 haze-ui stub 也换成
// 「AsyncSection 真实现 + 展示件 stub」同款设施（About/index.test.tsx 先
// 例），两侧 mock 设施即趋同，可再评估把 './Tags' 的 stub 彻底撤掉改为
// 真渲染（fetchTags 已 mock，真实 Tags 渲染 tag chips 不影响既有断言）。
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent} from '@testing-library/react';

import {renderView} from '@/test-utils';

const state = vi.hoisted(() => {
  const refetch = vi.fn();
  return {
    // useSearch 的读值（active tag 的唯一来源）
    tag: undefined as string | undefined,
    // useSetSearch 的写入口（tag 点击的断言口）
    setSearch: vi.fn(),
    // refetch 断言口（与 result 内同名成员同一实例，setResult 重建时复用）
    refetch,
    // useTagsQuery 的受控结果：分支驱动
    result: {
      data: [] as string[],
      loading: false,
      error: null as Error | null,
      stale: false,
      refetch
    }
  };
});

vi.mock('@/services/dataloaders', () => ({
  useTagsQuery: () => state.result
}));

vi.mock('@native-router/react', () => ({
  useSearch: () => ({tag: state.tag, offset: 0, limit: 10}),
  useSetSearch: () => state.setSearch
}));

import Tags from './Tags';

// 每用例重建受控结果（refetch 与 state.refetch 同一 vi.fn，跨用例由
// resetAllMocks 清调用记录）
function setResult(over: Partial<Omit<typeof state.result, 'refetch'>> = {}) {
  state.result = {
    data: [],
    loading: false,
    error: null,
    stale: false,
    refetch: state.refetch,
    ...over
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.tag = undefined;
  setResult();
});

describe('Tags 侧栏（真实 haze-ui 渲染）', () => {
  it('正常态：标题 + tag 按钮，点击写入 search（useSetSearch 入口）', () => {
    setResult({data: ['react', 'vue']});
    renderView(<Tags />);

    expect(
      screen.getByRole('heading', {level: 3, name: 'Popular Tags'})
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'react'}));
    expect(state.setSearch).toHaveBeenCalledWith({tag: 'react'});
  });

  it('active tag：命中项 aria-pressed=true，其余 false', () => {
    state.tag = 'react';
    setResult({data: ['react', 'vue']});
    renderView(<Tags />);

    expect(
      screen.getByRole('button', {name: 'react'}).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', {name: 'vue'}).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('再点同一个 tag：清空筛选（写入空对象而非 undefined）', () => {
    state.tag = 'react';
    setResult({data: ['react']});
    renderView(<Tags />);

    fireEvent.click(screen.getByRole('button', {name: 'react'}));
    expect(state.setSearch).toHaveBeenCalledWith({});
  });

  it('loading：AsyncSection 占位（role=status + 默认文案），children 不渲染', () => {
    // data 非空但 loading 优先——占位期不得漏出 tag 按钮与标题
    setResult({data: ['react'], loading: true});
    renderView(<Tags />);

    expect(screen.getByRole('status').textContent).toContain('Loading…');
    expect(screen.queryByRole('button', {name: 'react'})).toBeNull();
    expect(
      screen.queryByRole('heading', {name: 'Popular Tags'})
    ).toBeNull();
  });

  it('error：role=alert 呈现固定文案，Retry 点击调 refetch（删缓存条目重拉入口）', () => {
    setResult({data: ['react'], error: new Error('tags exploded')});
    renderView(<Tags />);

    expect(screen.getByRole('alert').textContent).toContain(
      'Failed to load tags'
    );
    // error 分支同样不渲染 children
    expect(
      screen.queryByRole('heading', {name: 'Popular Tags'})
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('stale：aside 挂半透明类，非 stale 时不挂', () => {
    setResult({data: ['react']});
    const fresh = renderView(<Tags />);
    expect(screen.getByRole('complementary').className).toBe('');
    fresh.unmount();

    setResult({data: ['react'], stale: true});
    renderView(<Tags />);
    // 只断言「挂了类」不断言类名（linaria 生成名是实现细节）
    expect(screen.getByRole('complementary').className).not.toBe('');
  });
});
