import {css} from '@linaria/core';
import {useCallback, ReactNode, useEffect, useRef, useState} from 'react';
import {
  getDebugInfo,
  onDebug,
  type DebugEvent,
  type DebugInfo
} from '@native-router/core';
import {Badge, Button, Popover} from 'haze-ui';
import {InjectDevTools, type ObservableCache} from 'react-toolroom/devtools';
import {useControl, type Control} from 'react-use-control';

import {
  getMockConfigs,
  onMockConfigChange,
  setMockConfig,
  type MockConfigValue
} from '@/util/mock';
import {
  clearRequestLogs,
  getRequestLogs,
  onRequestLogsChange,
  type HttpRequestLog
} from '@/util/requestLog';
import {getPublishedRouter} from '@/util/routerHost';
import {allCaches, clearAllCaches} from '@/util/useQuery';

// InjectDevTools 不传 injectables：改为观察具名注册表（react-toolroom
// ≥0.16 的发现通道）——createQueryHook 内部的 useInjectable(queryFn,
// {name}) 已把实例注册进去（组件卸载自动注销），面板自动发现并追踪场景
// query hook 发起的真实调用（时间/函数名/状态/耗时/参数 → 结果）。旧版
// 「面板自建 injectable 与场景 hook 内部实例 per-hook-instance 互不可见」
// 的限制已由注册表解决。caches 侧照旧：注册表条目的 cache 即
// createMemoryCacheProvider 产物，天然满足 ObservableCache 形状
//（snapshot 返回 {key,value,cachedAt[,pending]}，subscribe 收
// CacheEvent），结构化兼容直接透传，零字段适配。

type Props = {
  children: ReactNode;
  // 面板开合遵循 control 模式（同 haze-ui 组件约定）：传 Control 受控
  //（宿主完全接管开关），传 boolean 为非受控初值，不传则默认收起
  open?: Control<boolean> | boolean;
};

// cache.snapshot() 的条目形状（react-toolroom CacheProvider 契约：
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
  /** 面板侧附加：条目所属的实体 cache 注册名（createQueryCache 自动登记） */
  cacheName: string;
};

// cache.subscribe() 的事件形状（CacheProvider 契约的 CacheEvent）：set 不带
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

// InjectDevTools 的挂载小节：cache 快照表（caches）+ 具名注册表调用追踪
//（不传 injectables 即观察全部具名 injectable，见文件头注释）。caches
// 用打开面板时的注册表快照（allCaches 只增不减，收起再开重新收集），
// 模块常量身份恒稳定，满足 InjectDevTools 对 caches「身份恒稳定，否则
// 观察者重挂」的要求。
function InjectPanel() {
  const [caches] = useState<ObservableCache[]>(() =>
    allCaches.map(({cache}) => cache)
  );
  return <InjectDevTools caches={caches} title='Cache & Calls' />;
}

// DEV 角标与面板的浮层基座换 haze-ui Popover（锚定式触发器 + 浮动面板，
// open 走 control 受控）：触发器即面板锚点，落在 fixed 左上角容器里，
// 面板随之锚在角标下方展开（原生 popover API 浏览器进顶层，无 anchor
// 支持的退回 position:fixed + JS 定位）——原实现是两分支各挂一个裸
// createPortal 层，这里收敛为库组件。角标视觉：haze Popover 的触发器
// span（haze-Popover__container，稳定类名）无外观 API，经外围选择器描
// 成 30×30 的 solid 按钮观感（对齐原 <Button>DEV</Button> 与
// haze-styles__base 的 focus ring）；span 自带 role=button/tabIndex/
// aria-haspopup/aria-expanded，键盘 Enter/Space 开合由库内建。
const corner = css`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  & > :global(.haze-Popover__container) {
    width: 30px;
    height: 30px;
    justify-content: center;
    align-items: center;
    border-radius: var(--haze-radius-md);
    font-family: var(--haze-font-sans);
    font-size: var(--haze-text-xs);
    font-weight: var(--haze-weight-medium);
    line-height: var(--haze-leading-tight);
    cursor: pointer;
    user-select: none;
    background: var(--haze-color-primary);
    color: var(--haze-color-text-inverse);
    transition:
      background 0.15s,
      box-shadow 0.15s;
    &:hover {
      background: var(--haze-color-primary-hover);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px var(--haze-color-focus-ring);
      outline: none;
    }
  }
`;

// 面板本体 300×300 可滚动；外观 chrome（边框/内衬/阴影）由 Popover 的
// haze-Popover__panelVisuals 提供，取代原 <Card>。z-index 仅对无原生
// popover 的退回路径有意义（顶层路径不参与 z 轴竞争），对齐旧层的
// z-index:1000。
const panelStyle = css`
  width: 300px;
  height: 300px;
  overflow: auto;
  z-index: 1000;
`;

function DevToolInner({open: openControl}: {open?: Control<boolean> | boolean}) {
  const [open, setOpen, openCtrl] = useControl(openControl as Control<boolean>, false);
  const [config, setConfig] = useState(getMockConfigs);

  useEffect(
    () =>
      onMockConfigChange(() => {
        setConfig(getMockConfigs);
      }),
    []
  );

  // content 随开合挂载/卸载而非常驻：haze Popover 关闭只把面板藏起来
  //（非原生路径 display:none、原生路径 hidePopover），面板内的订阅
  //（CacheView/RequestLogView/InjectPanel 各自的 cache 监听）若常驻，
  // 「面板关闭即全部退订」的原语义就丢了。
  const content = open ? (
    <>
      <Button onClick={() => setOpen(false)}>Close</Button>
      {Object.entries(config).map(([key, val]) => (
        <MockView
          key={key}
          name={key}
          value={val}
          onChange={(when) => {
            setMockConfig(key, {...val, when});
            // 用户切换 mock 模式即清全部实体缓存：避免上一模式的缓存
            // 值（如 'always' 经 useMock 链写进缓存的假数据）新鲜
            // 命中，挡住新模式生效
            clearAllCaches();
          }}
        />
      ))}
      <hr />
      <CacheView />
      <hr />
      {/* react-toolroom/devtools 面板：cache 快照表复用 allCaches
          注册表逐实体渲染 Key/Age/Value 表；调用追踪经具名注册表观察
          场景 query hook 发起的真实调用（见文件头注释）。自研 CacheView
          （聚合 + 事件流 + Clear）保留：面板看逐实体明细与调用追踪，
          CacheView 看注册表全貌与事件流。RequestLogView 仍保留——
          它是 http 层视角（URL/状态码），覆盖路由 loader 通道与一切
          未走场景 query hook 的请求，与 inject 追踪（场景 hook 内视角）
          互补。 */}
      <InjectPanel />
      <hr />
      <RequestLogView />
      <hr />
      {/* 路由观察面板（core ≥1.16 onDebug/getDebugInfo）：viewStack 快照
          概况 + 导航事件时间线，见 RouteView 注释 */}
      <RouteView />
    </>
  ) : null;

  return (
    <div className={corner}>
      {/* open 传 openCtrl（useControl 三元组第三元）：宿主给了 control
          则它是同一状态的代理（Close/角标/light-dismiss 三处写回收敛
          到同一份状态），宿主给 boolean/不传则是本组件自持状态的
          control。角标在面板打开时保持可见（原实现收起角标换面板），
          点击/Escape/点外关面板均由库内建。 */}
      <Popover open={openCtrl} content={content} className={panelStyle}>
        DEV
      </Popover>
    </div>
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

// 事件文案：set 事件不带 key，以事件前后聚合 snapshot 的差集（新增 key
// 或 cachedAt 变化）反推被写的 key；反推不出（在飞槽位注册、同毫秒覆写
// 等 snapshot 无差异的场合）退化为裸 'set'。delete 侧无法从事件形状区分
// clear 与单删（clear 也携带全部被删元组），按「事发 cache 已删空且多于
// 一条」识别 clear 语义（聚合视图下 next 含其它实体条目，判空只能看事发
// cache 自身），其余展示被删条数——仅剩一条时的 clear 会显示成
// 'delete 1 条'，对检查器而言无害
function formatEvent(
  e: CacheEvent,
  prev: CacheEntry[],
  next: CacheEntry[],
  sourceEmpty: boolean
): string {
  if (e.type === 'set') {
    const prevAt = new Map(prev.map((entry) => [entry.key, entry.cachedAt]));
    const changed = next.filter((entry) => prevAt.get(entry.key) !== entry.cachedAt);
    // 单 key 写入（set/load settle/hydrate 均逐 key 通知）：展示截断 key；
    // 反推不出（在飞槽位注册、同毫秒覆写等 snapshot 无差异）退化为裸 'set'
    const [only] = changed;
    return changed.length === 1 && only ? `set ${truncateKey(only.key)}` : 'set';
  }
  return sourceEmpty && e.deleted.length > 1
    ? 'clear'
    : `delete ${e.deleted.length} 条`;
}

// 缓存检查器（多实体聚合）：直读 allCaches 注册表（name + cache 成对，
// 由 createQueryCache 创建实体时自动登记，无需此处按索引配名）遍历
// snapshot()，
// 订阅每个 cache 的变更事件（含 clear）刷新并追加事件流；面板关闭即
// 卸载取消全部订阅。条目带 cache 名前缀（article/home/…），Clear 按钮
// 清空全部实体。
function CacheView() {
  const collect = useCallback(() => {
    const rows: CacheEntry[] = [];
    for (const {name, cache} of allCaches) {
      for (const entry of cache.snapshot?.() ?? []) {
        rows.push({...entry, cacheName: name});
      }
    }
    return rows;
  }, []);
  const [entries, setEntries] = useState<CacheEntry[]>(collect);
  const [events, setEvents] = useState<{id: number; label: string}[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // set 事件不带 key：反推被写 key 需要「事件前」的条目，用 ref 跟住
  // 最新快照（监听器可能在一帧内连发多次，不能依赖 state 时序）
  const prevEntries = useRef(entries);
  // 事件 id 单调递增：新事件插在列表顶部，index key 会整体错位
  const nextEventId = useRef(0);

  const refresh = useCallback(() => {
    const next = collect();
    prevEntries.current = next;
    setEntries(next);
    setNow(Date.now());
  }, [collect]);

  // 监听器只碰 ref 与 setter（身份稳定），effect 空依赖只订阅一次，
  // 卸载退订全部——与 refresh 分开，避免重复订阅
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    for (const {cache} of allCaches) {
      const unsub = cache.subscribe?.((e) => {
        const next = collect();
        const label = formatEvent(
          e,
          prevEntries.current,
          next,
          (cache.snapshot?.() ?? []).length === 0
        );
        prevEntries.current = next;
        setEntries(next);
        setNow(Date.now());
        setEvents((list) =>
          [{id: nextEventId.current++, label}, ...list].slice(0, MAX_EVENTS)
        );
      });
      if (unsub) unsubs.push(unsub);
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [collect]);

  return (
    <div>
      <div>
        <b>Cache: {entries.length}</b>
        <Button
          onClick={() => {
            clearAllCaches();
            refresh();
          }}
        >
          Clear
        </Button>
      </div>
      {entries.map((entry) => (
        <div key={`${entry.cacheName}:${entry.key}`} title={entry.key}>
          {entry.cacheName}·{truncateKey(entry.key)} · {ageSeconds(entry.cachedAt, now)}s
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

// 请求日志视图：http.ts 的 dev-only withLogging 推入 requestLog 环形
// 缓冲，这里订阅展示（最新在上）。每条按事件类型着色：Request 中性、
// Response 按 2xx/其它分 success/danger、Error 红。面板关闭即卸载退订。
type LogData = {url?: string; method?: string; status?: number};

function logVariant(log: HttpRequestLog): 'default' | 'success' | 'danger' {
  if (log.msg === 'Response') {
    const status = (log.data as LogData | undefined)?.status ?? 0;
    return status >= 200 && status < 300 ? 'success' : 'danger';
  }
  if (log.msg === 'Error') return 'danger';
  return 'default';
}

function RequestLogView() {
  const [logs, setLogs] = useState<HttpRequestLog[]>(getRequestLogs);

  useEffect(
    () => onRequestLogsChange(() => setLogs(getRequestLogs())),
    []
  );

  return (
    <div>
      <div>
        <b>Requests: {logs.length}</b>
        <Button onClick={clearRequestLogs}>Clear Logs</Button>
      </div>
      {logs.map((log) => {
        const data = (log.data as LogData | undefined) ?? {};
        const label =
          log.msg === 'Request'
            ? `→ ${(data.method ?? 'GET')} ${data.url ?? ''}`
            : log.msg === 'Response'
              ? `← ${data.status} ${data.url ?? ''}`
              : `✗ ${data.url ?? ''}`;
        return (
          <div key={log.id}>
            <Badge size='sm' variant={logVariant(log)}>
              {label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// 导航事件 → 时间线条目文案。含 duration 的四类事件直接带上毫秒数，
// nav-commit 的 replay 标志（POP 命中 viewStack 快照的零请求回放）后缀
// 标出——它是「back 为何零请求」的直接证据；nav-start 无 duration
//（链刚开始），带 action（push/pop/replace）与请求目标 to。
function formatNavEvent(e: DebugEvent): string {
  const to = truncateKey(e.to, 24);
  switch (e.type) {
    case 'nav-start':
      return `start ${e.action} ${to}`;
    case 'nav-commit':
      return `commit ${e.action} ${to} ${e.duration}ms${
        e.replay ? ' ·replay' : ''
      }`;
    case 'nav-supersede':
      return `supersede ${to} by ${truncateKey(e.by, 24)} ${e.duration}ms`;
    case 'nav-cancel':
      return `cancel ${to} ${e.duration}ms`;
    case 'nav-error':
      return `error ${to} ${e.duration}ms`;
  }
}

// 导航事件行着色：commit 绿、error 红、cancel/supersede 黄（链没有落
// 地的两种方式）、start 中性——与 RequestLog 的状态着色同一套语义。
function navVariant(e: DebugEvent): 'default' | 'success' | 'warning' | 'danger' {
  switch (e.type) {
    case 'nav-commit':
      return 'success';
    case 'nav-error':
      return 'danger';
    case 'nav-cancel':
    case 'nav-supersede':
      return 'warning';
    default:
      return 'default';
  }
}

// 路由观察视图（core ≥1.16 可观察性面）：上半是 getDebugInfo 快照——
// 当前 location（to）、会话窗深度/基点（stackDepth/baseIndex，绝对
// history index）、viewStack 快照数（snapshots，back/forward 零请求
// 回放的弹药）与在飞链（resolving，null 为 idle）；下半是 onDebug 导航
// 事件时间线（最近 MAX_EVENTS 条）。快照随事件重取（导航落点/深度只
// 在事件间变化）。实例经 routerHost 登记（面板在 Router 树外，
// useRouteDebug 的 context 到不了这里——它就是 onDebug+getDebugInfo
// 的 useSyncExternalStore 封装，此处按同一语义直接接线）；订阅优先走
// 实例方法（create() 恒挂载），独立函数 onDebug(router, l) 兜任意
// router 对象。面板关闭即卸载退订（同 CacheView/RequestLogView）。
function RouteView() {
  const [router] = useState(getPublishedRouter);
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [events, setEvents] = useState<{id: number; label: string; event: DebugEvent}[]>([]);
  // 事件 id 单调递增：新事件插在列表顶部，index key 会整体错位（同 CacheView）
  const nextEventId = useRef(0);

  useEffect(() => {
    if (!router) return;
    const snapshot = () =>
      setInfo(router.getDebugInfo?.() ?? getDebugInfo(router));
    snapshot();
    const listener = (event: DebugEvent) => {
      snapshot();
      setEvents((list) =>
        [
          {id: nextEventId.current++, label: formatNavEvent(event), event},
          ...list
        ].slice(0, MAX_EVENTS)
      );
    };
    const unsubscribe = router.onDebug?.(listener) ?? onDebug(router, listener);
    return unsubscribe;
  }, [router]);

  if (!router) {
    // 面板先于应用挂载打开才会走到这里（实践不可达，DEV 兜底文案）
    return <div>Router not mounted yet.</div>;
  }

  return (
    <div>
      <div>
        <b>Routes</b>
        <Button onClick={() => setEvents([])}>Clear Events</Button>
      </div>
      {info && (
        <>
          <div title={info.to}>to {truncateKey(info.to, 28)}</div>
          <div>
            {`index ${info.index} · depth ${info.stackDepth} · base ${info.baseIndex} · snapshots ${info.snapshots}`}
          </div>
          {info.resolving ? (
            <Badge size='sm' variant='warning'>
              ⏳ resolving {truncateKey(info.resolving.to, 20)}
            </Badge>
          ) : (
            <Badge size='sm'>idle</Badge>
          )}
        </>
      )}
      <hr />
      <b>Nav events</b>
      {events.map(({id, label, event}) => (
        <div key={id} title={event.to}>
          <Badge size='sm' variant={navVariant(event)}>
            {label}
          </Badge>
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
      {show && <pre>{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}

export default function DevTool({children, open}: Props) {
  return (
    <>
      {children}
      <DevToolInner open={open} />
    </>
  );
}
