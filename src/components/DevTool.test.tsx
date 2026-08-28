import type {Article, Comment} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {useControl} from 'react-use-control';

import {stableHash} from 'react-toolroom/async';


import {articleCache, clearAllCaches, commentsCache, createQueryCache} from '@/util/useQuery';
import {clearRequestLogs, pushRequestLog} from '@/util/requestLog';

import DevTool, {truncateKey, ageSeconds} from './DevTool';

// 沿用 RouterError.test.tsx 的 haze-ui mock 约定（UMD 产物在 vitest ESM
// 下无法提供命名导出）。useControl 已改为直接依赖 react-use-control
//（纯 ESM），走真模块，不再需要 useState 替身。
vi.mock('haze-ui', () => ({
  Button: ({children, onClick}: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({children}: any) => <div>{children}</div>,
  Badge: ({children}: any) => <span>{children}</span>
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

describe('DevTool RequestLogView', () => {
  beforeEach(() => {
    clearRequestLogs();
  });

  it('lists request log entries newest-first with status labels', () => {
    // 模拟 http.ts dev 管道 withLogging 推入的三类事件
    pushRequestLog('Request', {url: '/api/articles', method: 'GET'});
    pushRequestLog('Response', {url: '/api/articles', status: 200});
    pushRequestLog('Error', {url: '/api/tags', error: new Error('boom')});

    openPanel();

    expect(screen.getByText('Requests: 3')).toBeDefined();
    expect(screen.getByText('→ GET /api/articles')).toBeDefined();
    expect(screen.getByText('← 200 /api/articles')).toBeDefined();
    expect(screen.getByText('✗ /api/tags')).toBeDefined();
  });

  it('Clear Logs empties the buffer', () => {
    pushRequestLog('Request', {url: '/x', method: 'GET'});
    openPanel();

    fireEvent.click(screen.getByText('Clear Logs'));

    expect(screen.getByText('Requests: 0')).toBeDefined();
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

  it('honors a controlled open prop via control object', () => {
    // 宿主持有 open 状态（useControl 三元组的 ctrl）传给 DevTool：
    // 外部 setVisible(true) 直接开面板，面板内 Close 写回同一状态，
    // 宿主可见 open=false——同一 control 双向共享，非拷贝同步
    function Harness() {
      const [open, setOpen, openCtrl] = useControl(undefined, false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open-externally</button>
          <span data-testid="host-open">{String(open)}</span>
          <DevTool open={openCtrl}>
            <div>content</div>
          </DevTool>
        </>
      );
    }

    render(<Harness />);
    // 初始收起：面板未挂载（Close 不可见），宿主状态 false
    expect(screen.queryByText('Close')).toBeNull();
    expect(screen.getByTestId('host-open').textContent).toBe('false');

    // 宿主驱动开面板
    fireEvent.click(screen.getByText('open-externally'));
    expect(screen.getByText('Close')).toBeDefined();
    expect(screen.getByTestId('host-open').textContent).toBe('true');

    // 面板内 Close 写回共享状态，宿主同步看到 false
    fireEvent.click(screen.getByText('Close'));
    expect(screen.getByTestId('host-open').textContent).toBe('false');
    expect(screen.queryByText('Close')).toBeNull();
  });

  it('unsubscribes every cache listener on unmount', () => {
    // 桩掉 subscribe 以拿到退订函数：CacheView 卸载必须退订，否则面板
    // 关闭后事件仍往已卸载组件的 setState 打（内存泄漏 + 幽灵状态）。
    // 面板开着时有两位订阅者——自研 CacheView 与 react-toolroom 的
    // InjectDevTools（同一 cache 各订阅一次，各自退订）——以 articleCache
    // 为代表断言订阅数与退订数一致
    const unsub = vi.fn();
    const listeners = new Set<unknown>();
    const subscribeSpy = vi
      .spyOn(articleCache, 'subscribe')
      .mockImplementation(((listener: unknown) => {
        listeners.add(listener);
        return unsub;
      }) as never);
    try {
      const {unmount} = render(
        <DevTool>
          <div>content</div>
        </DevTool>
      );
      // 面板未开：CacheView/InjectPanel 均未挂载，不应有订阅
      expect(subscribeSpy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('DEV'));
      expect(subscribeSpy).toHaveBeenCalledTimes(2);
      expect(listeners.size).toBe(2);

      unmount();
      expect(unsub).toHaveBeenCalledTimes(2);
    } finally {
      subscribeSpy.mockRestore();
    }
  });

  it('InjectDevTools renders a per-entity cache snapshot table fed from the registry', () => {
    // devtools 面板的 cache 表：每个 ObservableCache 一张表（Key/Age/
    // Value 三列），行 key 是 hash 后的字符串——种子一条 tag 实体后开
    // 面板，断言表渲染出该实体条目。injectables 恒空（观察不到 useQuery
    // 侧调用，见 DevTool.tsx NO_INJECTABLES 注释），面板应显示空态文案
    // 而非调用记录；cache 快照表断言保留
    const tagsCache = createQueryCache<string[], []>('devtool-test-tags');
    tagsCache.set([], ['react', 'redux']);
    seedA('inject-probe', 1);
    openPanel();

    // 面板标题（title prop）与空态注入追踪都在
    expect(screen.getByText('Cache')).toBeDefined();
    expect(screen.getByText('No calls settled yet.')).toBeDefined();
    // article 实体条目经自研 CacheView（带实体名前缀的行）可见
    expect(screen.getByTitle(stableHash(['inject-probe']))).toBeDefined();
    // devtools 面板订阅的是同一 registry cache：tags 单例条目的 hash key
    // 出现在 devtools 表格单元格中（Key 列）
    const tagsKey = stableHash([]);
    const keyCells = screen.getAllByText(tagsKey);
    expect(keyCells.length).toBeGreaterThanOrEqual(1);
    // Value 列渲染 JSON 摘要
    expect(screen.getAllByText(JSON.stringify(['react', 'redux'])).length).toBeGreaterThanOrEqual(1);
  });

  it('survives parent rerenders while the panel is open (hooks order stability)', () => {
    // 回归：InjectPanel 内不得出现「useMemo 工厂内调 hook」——首帧注册
    // N 个 hook、缓存命中后工厂不再执行、hook 数骤减，面板开着时父级
    // 任一次重渲染即崩（'Do not call Hooks inside useMemo'）。宿主
    // rerender 触发整树重渲染，面板内容必须原样存活
    const tagsCache = createQueryCache<string[], []>('devtool-test-rerender');
    tagsCache.set([], ['react']);
    const {rerender} = render(
      <DevTool>
        <div>content</div>
      </DevTool>
    );
    fireEvent.click(screen.getByText('DEV'));
    expect(screen.getByText('Cache')).toBeDefined();

    rerender(
      <DevTool>
        <div>content-v2</div>
      </DevTool>
    );
    // 面板仍开着且内容完好：标题、cache 表、自研 CacheView 计数都在
    expect(screen.getByText('Cache')).toBeDefined();
    expect(screen.getAllByText(stableHash([])).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Cache: \d+/)).toBeDefined();
  });
});
