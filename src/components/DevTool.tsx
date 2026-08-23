import {css} from '@linaria/core';
import {useCallback, ReactNode, useEffect, useState} from 'react';
import {Button, Card, useControl} from 'haze-ui';

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
// 仅原样展示，不感知其形态）
type CacheEntry = {
  key: string;
  value: unknown;
  cachedAt: number;
};

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
              onChange={(when) => setMockConfig(key, {...val, when})}
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

// 共享缓存检查器：snapshot() 拉取条目，subscribe() 在任意条目变更（含
// clear）时刷新；面板关闭即卸载取消订阅，重开时重新挂载拉取一次即可。
function CacheView() {
  const [entries, setEntries] = useState<CacheEntry[]>(
    () => queryCache.snapshot?.() ?? []
  );
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setEntries(queryCache.snapshot?.() ?? []);
    setNow(Date.now());
  }, []);

  useEffect(() => queryCache.subscribe?.(refresh), [refresh]);

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
        </div>
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
