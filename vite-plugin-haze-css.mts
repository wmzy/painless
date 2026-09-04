// painless 项目内 vite 插件：haze-ui 按需 CSS 自动收集（取代手工维护的
// src/styles.ts 清单）。机制：transform 阶段扫描模块源码里的
// `import {…} from 'haze-ui'` 具名导入，把用到的组件映射为
// `haze-ui/css/<family>.css` 的副作用 import 前置注入该模块——css 文件
// 随消费模块一起进模块图，去重、分包（懒加载视图只带自己的组件 css）、
// HMR 全部交给 vite/rollup 原生管道，插件自身零状态。
//
// 【独立包计划】本插件目前是 painless 项目内实现（与 haze-ui dist/css
// 文件名约定强耦合）。待家族映射规则与多项目形态稳定后，计划拆为独立
// 包（泛化为「组件库 dist/css 按需收集插件」，家族映射表可配置），届时
// painless 改为依赖该包。拆包前请勿在本文件外复制这套映射逻辑。
//
// 家族映射规则（haze-ui dist/css 同目录家族共享一个文件，子组件归并；
// FAMILY 表对 haze-ui 1.12 的全部 140 个值导出做到全覆盖，每条家族
// 归并都以「该子组件的 .haze-<X>__ 类实际落在哪个 css 文件」为准）：
// - 同名文件家族：ListItem→list、TagGroupItem→tag-group、NavLink→
//   navigation-bar、Title/Text/Paragraph→typography、ToastContainer/
//   useToast→toast、FormItem→form、AccordionItem→accordion、
//   CarouselSlide→carousel、ConversationItem→conversation-list、
//   RadioGroup→radio、StepTimelineItem→step-timeline、TimelineItem→
//   timeline、BreadcrumbItem→breadcrumb、GridItem→grid；
// - 前缀家族（菜单/浮层类组合件的 Trigger/Content/Item/Separator 子件）：
//   Collapsible{Trigger,Content}→collapsible、Command{Input,List,Item}→
//   command、ContextMenu 四件套→context-menu、DropdownMenu 四件套→
//   dropdown-menu、Menu{Item,Divider}→menu、Tab{,List,Panel}→tabs、
//   Table{Head,Body,Row,Cell}→table、Resizable{Group,Panel,Handle}→
//   resizable、StatGroup→stat、Step→stepper、Option→select（Select 的
//   原生 <option> 子件）；
// - 其余组件按 kebab-case 对应 dist/css/<组件>.css（OTPInput→
//   otp-input.css，连续大写按「词首」断词）。
// 映射源分两档（见下方 manifest()/cssFileOf）：haze-ui ≥1.22 随包发布
// dist/css-manifest.json（契约 {"families": {导出名: css 文件名}, "noCss":
// [导出名]}）——文件在场即为唯一映射源，模板内 FAMILY/NO_CSS 表退役为
// 无该文件时（如当前安装的 1.21）的 fallback；无论走哪档，解析出的
// css 文件都在 transform 内经 require.resolve 落到 painless 实际安装的
// haze-ui 包内做 fs 存在性校验，缺文件即 fail-fast，报错四要素齐：
// 触发注入的源文件、具名导入名、期望 css 路径、修复提示（升级 haze-ui
// 或修正映射），杜绝注入不存在文件。
// tokens.css 恒定先行——主题变量/spacing/排版基线都在其中，经去重后
// 落在模块图最前端（入口 index.tsx 亦导入 haze-ui）。haze-ui 无全局
// reset（无 body/html/* 规则），不存在漏引基础样式的风险。
//
// 已知边界（拆包时一并考虑）：
// - 只识别对 'haze-ui' 的直接具名 import；经本地 barrel 再导出（
//   `export {X} from 'haze-ui'`）的间接消费不在此列（本项目无此模式）。
// - 命名空间导入（`import * as haze from 'haze-ui'`）收集不到任何
//   具名导入：检测到即打 this.warn 开发期警告，建议改为具名导入。
// - 文件级粒度：文件内 import 了组件即注入，与旧的 styles.ts 等价。
// - 注释里的 import 语句会被剥离后忽略（// 行注释与 /* */ 块注释）；
//   字符串字面量中的形似 import 文本仍可能被误识别——接受为已知边界
//   （误报至多注入一个存在的 css，无构建破坏）。
// - vitest（vitest.config.mts）不接本插件：测试不走 css 管道；haze-ui
//   dist ≥1.11.1 纯 ESM 零 css 说明符，Node 直连即可（历史 inline 记录
//   见 vitest.config.mts 注释）。
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import type {Plugin} from 'vite';

const require = createRequire(import.meta.url);

// tokens.css 每个 haze-ui 消费模块都注入，rollup 按模块 id 去重后仅保留
// 模块图中最先执行的一份（入口侧），保证先于全部组件 css。
const TOKENS = 'haze-ui/css/tokens.css';

// 子组件 → 家族 css 文件名（不含 .css）。未命中的组件名走 kebab-case。
// 【fallback】本表与下方 NO_CSS 仅在 haze-ui 未随包发布
// dist/css-manifest.json 时生效（manifest 在场则它是唯一映射源）。
const FAMILY: Record<string, string> = {
  // 同名文件家族
  ListItem: 'list',
  TagGroupItem: 'tag-group',
  NavLink: 'navigation-bar',
  Title: 'typography',
  Text: 'typography',
  Paragraph: 'typography',
  ToastContainer: 'toast',
  useToast: 'toast',
  FormItem: 'form',
  AccordionItem: 'accordion',
  BreadcrumbItem: 'breadcrumb',
  CarouselSlide: 'carousel',
  ConversationItem: 'conversation-list',
  RadioGroup: 'radio',
  StepTimelineItem: 'step-timeline',
  TimelineItem: 'timeline',
  GridItem: 'grid',
  // 受控核心（*Core）与同名完整组件共用一份家族 css：haze-<X>Core__*
  // 类就落在 <family>.css 里（1.12.2 接入批换用 *Core 控件时漏登记，
  // kebab 直拼 input-core.css 不存在令 build 失败——补此三条）
  InputCore: 'input',
  TextareaCore: 'textarea',
  TagInputCore: 'tag-input',
  // ButtonLink 与 Button 共享 styles.ts：haze-ButtonLink__* 落在
  // button.css（haze-ui 1.16 新导出，kebab 直拼 button-link.css 不存在）
  ButtonLink: 'button',
  // 前缀家族：组合件的 Trigger/Content/Item/Separator 等子件
  CollapsibleTrigger: 'collapsible',
  CollapsibleContent: 'collapsible',
  CommandInput: 'command',
  CommandList: 'command',
  CommandItem: 'command',
  ContextMenuTrigger: 'context-menu',
  ContextMenuContent: 'context-menu',
  ContextMenuItem: 'context-menu',
  ContextMenuSeparator: 'context-menu',
  DropdownMenuTrigger: 'dropdown-menu',
  DropdownMenuContent: 'dropdown-menu',
  DropdownMenuItem: 'dropdown-menu',
  DropdownMenuSeparator: 'dropdown-menu',
  MenuItem: 'menu',
  MenuDivider: 'menu',
  Tab: 'tabs',
  TabList: 'tabs',
  TabPanel: 'tabs',
  TableHead: 'table',
  TableBody: 'table',
  TableRow: 'table',
  TableCell: 'table',
  ResizableGroup: 'resizable',
  ResizablePanel: 'resizable',
  ResizableHandle: 'resizable',
  StatGroup: 'stat',
  Step: 'stepper',
  Option: 'select'
};

// kebab-case：双段替换处理「小写|数字→大写」（NumberInput）与「连续
// 大写的词首」（OTPInput→otp-input、AIChat→ai-chat），单段正则对后者
// 会漏插连字符注入不存在的文件。
const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const cssFileOf = (name: string): {file: string | null; covered: boolean} => {
  const state = manifest();
  if (state.kind === 'present') {
    const family = state.manifest.families[name];
    if (typeof family === 'string') {
      // families 值为 css 文件名，容忍带 .css 后缀的写法
      return {file: family.replace(/\.css$/, ''), covered: true};
    }
    if (state.manifest.noCss.includes(name)) return {file: null, covered: true};
    // manifest 覆盖缺口：file 仅用于报错里指认「会猜到哪个文件」
    return {file: kebab(name), covered: false};
  }
  if (NO_CSS.has(name)) return {file: null, covered: true};
  return {file: FAMILY[name] ?? kebab(name), covered: true};
};

// JS-only 导出（主题/设计 token 对象、无样式的纯逻辑 hook）：无对应
// css 文件，不得 kebab 化注入（useControl→use-control.css 不存在）。
// typography token 对象虽与 typography.css 同名，但标题排版 css 由
// Title/Text 家族映射覆盖，纯 token 消费不需要样式。
const NO_CSS = new Set([
  'lightTheme',
  'darkTheme',
  'spacing',
  'typography',
  'TOKEN_REGISTRY',
  'COMPONENT_TOKENS',
  'useControl',
  'useFormControl',
  // 纯逻辑 hook（1.21 上移入主桶，同 useControl 一类）：无样式产物
  'useTitle'
]);

// 具名导入语句：import {A, type B, C as D} from 'haze-ui'（含多行）。
// 不匹配 import type 整句（纯类型导入会被完全剥除，无运行时样式需求）。
const NAMED_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]haze-ui['"]/g;

// 命名空间导入收集不到任何具名导入，开发期警告提示改具名导入。
const NAMESPACE_IMPORT_RE = /import\s*\*\s*as\s+\w+\s*from\s*['"]haze-ui['"]/;

// 注入前剥离注释，避免注释里的形似 import 文本被误识别。
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

// 注入目标存在性校验：从 painless 项目解析 haze-ui 包真实路径后
// require.resolve，缺文件抛错并指名是哪个导出、期望哪个 css。
const resolved = new Map<string, string>();
function resolveCss(spec: string): string {
  let path = resolved.get(spec);
  if (path === undefined) {
    path = require.resolve(spec);
    if (!fs.existsSync(path)) {
      // require.resolve 命中目录（无 exports 映射的兜底）时可能不带
      // 文件后缀，视为不可注入
      throw new Error(`${spec} 解析到非文件路径 ${path}`);
    }
    resolved.set(spec, path);
  }
  return path;
}

// dist/css 目录（缺文件错误的指认信息）：haze-ui 的 exports 未暴露
// package.json，只能从某个已解析 css 的路径取目录。
const cssDir = () => dirname(resolved.get(TOKENS) ?? resolveCss(TOKENS));

// haze-ui ≥1.22 随包发布的映射清单（dist/css-manifest.json，契约见文件
// 头注释）。三态：absent（未随包发布，走 FAMILY/NO_CSS fallback——当前
// 安装的 1.21 即此态）/ present（唯一映射源）/ broken（文件在场但 JSON
// 坏或形状不对——报错而非静默降级：发布侧 bug 伪装成「无 manifest」
// 会倒退回模板猜测映射，正是该文件要消灭的漂移面）。进程内读一次。
type CssManifest = {families: Record<string, string>; noCss: string[]};
type ManifestState =
  | {kind: 'absent'}
  | {kind: 'present'; manifest: CssManifest}
  | {kind: 'broken'; problem: string};

let manifestState: ManifestState | undefined;
function manifest(): ManifestState {
  if (manifestState === undefined) {
    const path = join(cssDir(), '..', 'css-manifest.json');
    if (!fs.existsSync(path)) {
      manifestState = {kind: 'absent'};
    } else {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
        const {families, noCss} = (parsed ?? {}) as Partial<CssManifest>;
        if (typeof families !== 'object' || families === null || !Array.isArray(noCss)) {
          throw new Error('形状不符，期望 {families: {…}, noCss: […]}');
        }
        manifestState = {kind: 'present', manifest: {families, noCss}};
      } catch (e) {
        manifestState = {
          kind: 'broken',
          problem:
            `haze-ui 的 css-manifest.json（${path}）存在但不可用：` +
            `${e instanceof Error ? e.message : String(e)}。请升级/重装 haze-ui。`
        };
      }
    }
  }
  return manifestState;
}

export default function hazeCss(): Plugin {
  return {
    name: 'painless-haze-css',
    // 先于 vite:esbuild 的 TS 剥离跑，才能看到原始具名导入
    // （inline `type` 修饰符否则已被移除）
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?', 1)[0] ?? id;
      if (id.startsWith('\0') || file.includes('node_modules')) return null;
      if (!/\.[jt]sx?$/.test(file)) return null;

      if (NAMESPACE_IMPORT_RE.test(code)) {
        this.warn(
          `[painless-haze-css] ${file} 使用了 \`import * as … from 'haze-ui'\`：` +
            '命名空间导入收集不到具名组件，无法按需注入 css。' +
            '请改为具名导入（import {Button} from "haze-ui"）。'
        );
      }

      const names = new Set<string>();
      for (const match of stripComments(code).matchAll(NAMED_IMPORT_RE)) {
        const specs = match[1];
        if (!specs) continue;
        for (const spec of specs.split(',')) {
          const name = spec.trim().replace(/\s+as\s+\S+$/, '').trim();
          // 跳过 inline type 修饰符与空段（尾逗号）
          if (!name || name.startsWith('type ')) continue;
          names.add(name);
        }
      }
      if (names.size === 0) return null;

      // fail-fast 报错四要素：触发注入的源文件、具名导入名、期望 css
      // 路径、修复提示。gap = manifest 在场但该导出未被其覆盖。
      const missingCss = (name: string, spec: string, gap: boolean) =>
        `[painless-haze-css] 源文件 ${file} 的 \`import {${name}} from 'haze-ui'\` ` +
        `无法注入样式：期望的 ${spec} 在已安装的 haze-ui 内不存在` +
        `（css 目录：${cssDir()}）。` +
        (gap ? `该导出在 haze-ui 的 css-manifest.json（families/noCss）中未列出。` : '') +
        '修复：升级 haze-ui（新版本可能已含该 css 或已在 manifest 登记），' +
        '或修正 vite-plugin-haze-css.mts 的映射（manifest 缺席时的 FAMILY/NO_CSS 表）。';

      const state = manifest();
      if (state.kind === 'broken') this.error(`[painless-haze-css] ${state.problem}`);

      const specs = [
        TOKENS,
        ...[...names]
          .map((n) => {
            const {file: base, covered} = cssFileOf(n);
            if (base === null) return null;
            const spec = `haze-ui/css/${base}.css`;
            if (!covered) this.error(missingCss(n, spec, true));
            try {
              resolveCss(spec);
            } catch {
              this.error(missingCss(n, spec, false));
            }
            return spec;
          })
          .filter((spec): spec is string => spec !== null)
          // 家族映射令多个组件同落一个 css（Title/Text→typography），按
          // 文件去重——dev 下重复 import 会让浏览器重复加载同一文件
          .filter((f, i, arr) => arr.indexOf(f) === i)
      ];

      const inject = specs.map((f) => `import ${JSON.stringify(f)};`).join('\n');
      return `${inject}\n${code}`;
    }
  };
}
