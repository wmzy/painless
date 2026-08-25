import type {Article, Comment} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {useState} from 'react';

import {stableHash} from 'react-toolroom/async';


import {articleCache, clearAllCaches, commentsCache} from '@/util/useQuery';

import DevTool, {truncateKey, ageSeconds} from './DevTool';

// 沿用 RouterError.test.tsx 的 haze-ui mock 约定；DevTool 对 useControl 均为
// 非受控用法（useControl(undefined, initial)），用 useState 等价替身驱动面板开合。
vi.mock('haze-ui', () => ({
  Button: ({children, onClick}: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({children}: any) => <div>{children}</div>,
  Badge: ({children}: any) => <span>{children}</span>,
  useControl: <T,>(_control: unknown, initial: T) =>
    useState<T>(typeof initial === 'function' ? (initial as () => T)() : initial)
}));

function openPanel() {
  render(
    <DevTool>
      <div>content</div>
    </DevTool>
  );
  fireEvent.click(screen.getByText('DEV'));
}

describe('DevTool truncateKey', () => {
  it('keeps short hash keys as-is', () => {
    expect(truncateKey('["tag"]')).toBe('["tag"]');
  });

  it('keeps keys exactly at the limit', () => {
    expect(truncateKey('x'.repeat(24))).toBe('x'.repeat(24));
  });

  it('truncates keys longer than 24 chars', () => {
    const key = '["0123456789012345678901234567890"]';
    expect(truncateKey(key)).toBe(`${key.slice(0, 24)}…`);
  });
});

describe('DevTool ageSeconds', () => {
  it('floors the elapsed time to whole seconds', () => {
    expect(ageSeconds(1000, 1999)).toBe(0);
    expect(ageSeconds(1000, 2000)).toBe(1);
  });

  it('clamps clock-skew negatives to 0', () => {
    expect(ageSeconds(5000, 1000)).toBe(0);
  });
});

describe('DevTool CacheView', () => {
  // 测试种子：两个 [string] key 的实体 cache，值经断言收窄（面板只展示
  // 不消费值，形状无关紧要）
  const seedA = (k: string, v: unknown) => articleCache.set([k], v as Article);
  const seedC = (k: string, v: unknown) =>
    commentsCache.set([k], v as Comment[]);

  beforeEach(() => {
    // 实体 cache 是模块级单例，逐用例清空隔离
    clearAllCaches();
  });

  it('shows zero entries when all caches are empty', () => {
    openPanel();
    expect(screen.getByText('Cache: 0')).toBeDefined();
  });

  it('shows the entry count, hashed key and age from snapshot()', () => {
    seedA('tag', {items: []});
    openPanel();
    expect(screen.getByText('Cache: 1')).toBeDefined();
    // key 格式归 useQuery 的 hashArgs 所有（stableHash，如 [s:tag]），
    // 此处用同一公开函数计算期望值，不硬编码形态；行首带实体名前缀
    expect(screen.getByTitle(stableHash(['tag'])).textContent).toBe(
      `article·${truncateKey(stableHash(['tag']))} · 0s`
    );
  });

  it('aggregates entries across entity caches with name prefixes', () => {
    seedA('one', 1);
    seedC('two', []);
    openPanel();
    expect(screen.getByText('Cache: 2')).toBeDefined();
    expect(screen.getByTitle(stableHash(['one'])).textContent).toContain(
      'article·'
    );
    expect(screen.getByTitle(stableHash(['two'])).textContent).toContain(
      'comments·'
    );
  });

  it('truncates long keys and keeps the full one in title', () => {
    const args = ['0123456789012345678901234567890'];
    const key = stableHash(args);
    seedA(args[0]!, 1);
    openPanel();
    expect(screen.getByTitle(key).textContent).toBe(
      `article·${key.slice(0, 24)}… · 0s`
    );
  });

  it('clears all entity caches via the Clear button', () => {
    seedA('tag', {items: []});
    seedC('other', []);
    openPanel();
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getByText('Cache: 0')).toBeDefined();
    expect(articleCache.snapshot?.()).toEqual([]);
    expect(commentsCache.snapshot?.()).toEqual([]);
  });

  it('marks entries that have a request in flight', () => {
    seedA('tag', {items: []});
    // 已有 settled 数据再 load：snapshot 对该条目附加 pending
    //（纯在飞不进 snapshot，三态——stale 值 + 重验证中——才可见）；
    // 永不 settle 的 promise 把条目钉在在飞态，不产生后续事件
    void articleCache.load?.(['tag'], () => new Promise(() => undefined));
    openPanel();
    // 三态行：stale 值的 key/age 仍在，同一行上多出 in-flight 标记
    expect(screen.getByTitle(stableHash(['tag'])).textContent).toContain(
      '⏳ in-flight'
    );
  });

  it('lists set and delete events as they fire', () => {
    openPanel();
    // 面板已订阅：缓存变更经事件流驱动渲染，须包在 act 里结算更新
    act(() => {
      seedA('tag', {items: []});
    });
    // set 事件不带 key，面板用事件前后 snapshot 差集反推被写 key
    expect(
      screen.getByText(`set ${truncateKey(stableHash(['tag']))}`)
    ).toBeDefined();
    act(() => {
      articleCache.delete(['tag']);
    });
    expect(screen.getByText('delete 1 条')).toBeDefined();
  });

  it('lists clear when a multi-entry wipe empties the cache', () => {
    openPanel();
    // clear 语义按「事发 cache 删空且多于一条」识别：同一实体两条目
    act(() => {
      seedA('a', 1);
      seedA('b', 2);
    });
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getByText('clear')).toBeDefined();
    expect(screen.getByText('Cache: 0')).toBeDefined();
  });

  it('unsubscribes every cache listener on unmount', () => {
    // 桩掉 subscribe 以拿到退订函数：CacheView 卸载必须退订，否则面板
    // 关闭后事件仍往已卸载组件的 setState 打（内存泄漏 + 幽灵状态）。
    // 聚合面板对每个实体 cache 各订阅一次——以 articleCache 为代表断言
    const unsub = vi.fn();
    const listeners = new Set<unknown>();
    const subscribeSpy = vi
      .spyOn(articleCache, 'subscribe')
      .mockImplementation(((
        listener: (e: {type: 'set'} | {type: 'delete'; deleted: readonly unknown[][]}) => void
      ) => {
        listeners.add(listener);
        return unsub;
      }) as never);
    try {
      const {unmount} = render(
        <DevTool>
          <div>content</div>
        </DevTool>
      );
      // 面板未开：CacheView 未挂载，不应有订阅
      expect(subscribeSpy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('DEV'));
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(listeners.size).toBe(1);

      unmount();
      expect(unsub).toHaveBeenCalledTimes(1);
    } finally {
      subscribeSpy.mockRestore();
    }
  });
});
