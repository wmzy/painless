import {css} from '@linaria/core';
import {useCallback, ReactNode, useEffect, useRef, useState} from 'react';
import {Badge, Button, Card, useControl} from 'haze-ui';

import {
  getMockConfigs,
  onMockConfigChange,
  setMockConfig,
  type MockConfigValue
} from '@/util/mock';
import {queryCache} from '@/util/useQuery';

import Popover from './Popover';

type Props = {
  children: ReactNode;
};

// queryCache.snapshot() 的条目形状（react-toolroom CacheProvider 契约：
// key 为 hash 后的字符串——createQueryCache 现用结构化 stableHash 并剥离
// AbortSignal（见 src/util/useQuery.ts 的 hashArgs），形如 [s:tag]——
// cachedAt 为写入时的毫秒时间戳。key 具体格式归 useQuery 层所有，此处
// 仅原样展示，不感知其形态。pending 为 0.8.0 起的可选附加位：该条目
// 尚有在飞请求（三态：stale 数据 + 重验证中）时置真——纯在飞（还没有
// 任何 settled 数据）的条目不进 snapshot，故 pending 只会出现在「旧值
// 仍在展示」的行上）
type CacheEntry = {
  key: string;
  value: unknown;
  cachedAt: number;
  pending?: boolean;
};

// queryCache.subscribe() 的事件形状（同一 d.ts 的 CacheEvent）：set 不带
// key；delete 是「一切移除」的合流形状（单删/clear/deleteWhere/
// deletePrefix/过期），携带被删条目的原始 args 元组（无法还原元组的
// 条目——如 SSR hydrate 写入——被省略）。set 侧因此只能靠事件前后的
// snapshot 差集反推被写的 key，见 formatEvent
type CacheEvent = {
  type: 'set';
} | {
  type: 'delete';
  deleted: readonly unknown[][];
};

// 事件流保留的最近条数：够回看一轮典型交互，又不让 300px 面板被撑爆
const MAX_EVENTS = 8;

function DevToolInner() {
  const [open, setOpen] = useControl<boolean>(undefined, false);
  const [config, setConfig] = useState(getMockConfigs);

  useEffect(
    () =>
      onMockConfigChange(() => {
        setConfig(getMockConfigs);
      }),
    []
  );

  if (open) {
    return (
      <Popover
        x-class={css`
          width: 300px;
          height: 300px;
          top: 0;
          overflow: auto;
        `}
      >
        <Card>
          <Button onClick={() => setOpen(false)}>Close</Button>
          {Object.entries(config).map(([key, val]) => (
            <MockView
              key={key}
              name={key}
              value={val}
              onChange={(when) => {
                setMockConfig(key, {...val, when});
                // 用户切换 mock 模式即清共享缓存：避免上一模式的缓存
                // 值（如 'always' 经 useMock 链写进缓存的假数据）新鲜
                // 命中，挡住新模式生效
                queryCache.clear();
              }}
            />
          ))}
          <hr />
          <CacheView />
        </Card>
      </Popover>
    );
  }
  return (
    <Popover
      x-class={css`
        width: 30px;
        height: 30px;
        top: 0;
      `}
    >
      <Button onClick={() => setOpen(true)}>DEV</Button>
    </Popover>
  );
}

// key 是 hash 后的字符串（stableHash 结构化序列化，如 [s:tag]），可能很长：
// 面板里截断展示，完整串放 title 悬浮提示
export function truncateKey(key: string, max = 24): string {
  return key.length > max ? `${key.slice(0, max)}…` : key;
}

// 距 now 的缓存秒数（向下取整；时钟偏差导致的负值按 0 处理）
export function ageSeconds(cachedAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - cachedAt) / 1000));
}

// 事件文案：set 事件不带 key，以事件前后 snapshot 的差集（新增 key 或
// cachedAt 变化）反推被写的 key；反推不出（在飞槽位注册、同毫秒覆写等
// snapshot 无差异的场合）退化为裸 'set'。delete 侧无法从事件形状区分
// clear 与单删（clear 也携带全部被删元组），按「删空且多于一条」识别
// clear 语义，其余展示被删条数——仅剩一条时的 clear 会显示成
// 'delete 1 条'，对检查器而言无害
function formatEvent(
  e: CacheEvent,
  prev: CacheEntry[],
  next: CacheEntry[]
): string {
  if (e.type === 'set') {
    const prevAt = new Map(prev.map((entry) => [entry.key, entry.cachedAt]));
    const changed = next.filter((entry) => prevAt.get(entry.key) !== entry.cachedAt);
    // 单 key 写入（set/load settle/hydrate 均逐 key 通知）：展示截断 key；
    // 反推不出（在飞槽位注册、同毫秒覆写等 snapshot 无差异）退化为裸 'set'
    const [only] = changed;
    return changed.length === 1 && only ? `set ${truncateKey(only.key)}` : 'set';
  }
  return next.length === 0 && e.deleted.length > 1
    ? 'clear'
    : `delete ${e.deleted.length} 条`;
}

// 共享缓存检查器：snapshot() 拉取条目（含 pending 三态标记），subscribe()
// 在任意条目变更（含 clear）时刷新并追加事件流；面板关闭即卸载取消订阅，
// 重开时重新挂载拉取一次即可。
function CacheView() {
  const [entries, setEntries] = useState<CacheEntry[]>(
    () => queryCache.snapshot?.() ?? []
  );
  const [events, setEvents] = useState<{id: number; label: string}[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // set 事件不带 key：反推被写 key 需要「事件前」的条目，用 ref 跟住
  // 最新快照（监听器可能在一帧内连发多次，不能依赖 state 时序）
  const prevEntries = useRef(entries);
  // 事件 id 单调递增：新事件插在列表顶部，index key 会整体错位
  const nextEventId = useRef(0);

  const refresh = useCallback(() => {
    const next = queryCache.snapshot?.() ?? [];
    prevEntries.current = next;
    setEntries(next);
    setNow(Date.now());
  }, []);

  // 监听器只碰 ref 与 setter（身份稳定），effect 空依赖只订阅一次，
  // 卸载走 subscribe 返回的退订函数——与 refresh 分开，避免重复订阅
  useEffect(
    () =>
      queryCache.subscribe?.((e) => {
        const next = queryCache.snapshot?.() ?? [];
        const label = formatEvent(e, prevEntries.current, next);
        prevEntries.current = next;
        setEntries(next);
        setNow(Date.now());
        setEvents((list) =>
          [{id: nextEventId.current++, label}, ...list].slice(0, MAX_EVENTS)
        );
      }),
    []
  );

  return (
    <div>
      <div
        x-class={css`
          display: flex;
          justify-content: space-between;
          align-items: center;
        `}
      >
        <b>Cache: {entries.length}</b>
        <Button
          onClick={() => {
            queryCache.clear();
            refresh();
          }}
        >
          Clear
        </Button>
      </div>
      {entries.map((entry) => (
        <div key={entry.key} title={entry.key}>
          {truncateKey(entry.key)} · {ageSeconds(entry.cachedAt, now)}s
          {entry.pending && (
            <Badge size='sm' variant='warning'>
              ⏳ in-flight
            </Badge>
          )}
        </div>
      ))}
      <hr />
      <b>Events</b>
      {events.map(({id, label}) => (
        <div key={id}>{label}</div>
      ))}
    </div>
  );
}

function MockView({
  name,
  value,
  onChange
}: {
  name: string;
  value: MockConfigValue;
  onChange?: (when: string) => void;
}) {
  const [show, setShow] = useControl<boolean>(undefined, false);

  return (
    <div>
      <div onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}>
        {['always', 'empty', 'disabled'].map((when) => (
          <label key={when}>
            <input
              name={name}
              type='radio'
              value={when}
              defaultChecked={value.when === when}
            />
            {when}
          </label>
        ))}
      </div>
      <Button onClick={value.refresh as () => void}>Refresh</Button>
      <Button onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'} Schema
      </Button>
      <pre x-if={show}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function DevTool({children}: Props) {
  return (
    <>
      {children}
      <DevToolInner />
    </>
  );
}
