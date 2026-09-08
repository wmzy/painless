// useSetHomeSearch 的回归钉：库版 useSetSearch 在绝对 base（GitHub Pages
// /painless/）下把 raw pathname（含 baseUrl）再喂给 toLocation（又拼一次
// baseUrl）——tag 点击导航出 /painless/painless/?tag=api。本地替代用
// 绝对 '/?' 组装目标，本文件钉死「无双前缀 + replace 语义 + 缺省抹除」。
// core 的 toLocation/parseSearchSync 走真实现（toLocation 只读
// router.baseUrl，fake router 即可驱动；parseSearchSync 真跑写 schema，
// 「URL 抹缺省」行为与产线一致）。
import type {HomeSearchInput} from '@/types/search';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent} from '@testing-library/react';

import {renderView} from '@/test-utils';

const state = vi.hoisted(() => ({
  // 与产线同形：views/index.tsx 把 BASE_URL 剥尾斜杠后传入
  //（'/painless/' → '/painless'）
  router: {baseUrl: '/painless', history: {}},
  commitReplace: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  resolveEntry: vi.fn(),
  reusableEntry: vi.fn()
}));

vi.mock('@native-router/react', () => ({
  useRouter: () => state.router
}));

vi.mock('@native-router/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@native-router/core')>();
  return {
    ...actual,
    commitReplace: state.commitReplace,
    navigate: state.navigate,
    resolveEntry: state.resolveEntry,
    reusableEntry: state.reusableEntry
  };
});

import {useSetHomeSearch} from './useSetHomeSearch';

function Probe({input, replace}: {input: HomeSearchInput; replace?: boolean}) {
  const setSearch = useSetHomeSearch();
  return (
    <button
      onClick={() => void setSearch(input, replace ? {replace: true} : undefined)}
    >
      go
    </button>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  // reusableEntry 未命中（新条目）→ resolveEntry 分支：回显收到的
  // location（即 hook 内 toLocation 真实现的输出），供 commitReplace 断言
  state.reusableEntry.mockReturnValue(undefined);
  state.resolveEntry.mockImplementation(async (_r: unknown, location: unknown) => ({
    task: Promise.resolve(),
    location
  }));
});

describe('useSetHomeSearch（绝对 base 下无双前缀）', () => {
  it('push：navigate 目标是绝对 /?…（baseUrl 只拼一次）', async () => {
    renderView(<Probe input={{tag: 'api'}} />);
    fireEvent.click(screen.getByRole('button', {name: 'go'}));
    await vi.waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1));
    expect(state.navigate).toHaveBeenCalledWith(state.router, '/?tag=api');
  });

  it('空载荷：navigate 目标是 /', async () => {
    renderView(<Probe input={{}} />);
    fireEvent.click(screen.getByRole('button', {name: 'go'}));
    await vi.waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1));
    expect(state.navigate).toHaveBeenCalledWith(state.router, '/');
  });

  it('等于缺省的 offset/limit 被抹去（写 schema 契约）', async () => {
    renderView(<Probe input={{tag: 'api', offset: 0, limit: 10}} />);
    fireEvent.click(screen.getByRole('button', {name: 'go'}));
    await vi.waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1));
    expect(state.navigate).toHaveBeenCalledWith(state.router, '/?tag=api');
  });

  it('replace：commitReplace 收到的 location 单段 base 前缀，且不走 navigate', async () => {
    renderView(<Probe input={{tag: 'api'}} replace />);
    fireEvent.click(screen.getByRole('button', {name: 'go'}));
    await vi.waitFor(() => expect(state.commitReplace).toHaveBeenCalledTimes(1));
    const [, , location] = state.commitReplace.mock.calls[0]! as unknown[];
    expect(location).toMatchObject({pathname: '/painless/', search: '?tag=api'});
    expect(state.navigate).not.toHaveBeenCalled();
  });
});
