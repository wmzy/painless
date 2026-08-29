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
// 每个注入目标在 transform 内经 require.resolve 落到 painless 实际
// 安装的 haze-ui 包内校验，缺文件时抛指名道姓错误（哪个导出、期望哪个
// css 文件、提示补 FAMILY/NO_CSS），杜绝注入不存在文件。
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
// - vitest（vitest.config.mts）不接本插件：测试不走 css 管道，haze-ui
//   由 server.deps.inline 处理。
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import type {Plugin} from 'vite';

const require = createRequire(import.meta.url);

// tokens.css 每个 haze-ui 消费模块都注入，rollup 按模块 id 去重后仅保留
// 模块图中最先执行的一份（入口侧），保证先于全部组件 css。
const TOKENS = 'haze-ui/css/tokens.css';

// 子组件 → 家族 css 文件名（不含 .css）。未命中的组件名走 kebab-case。
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

const cssSpec = (name: string) => `haze-ui/css/${FAMILY[name] ?? kebab(name)}.css`;

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
  'useFormControl'
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

      const specs = [
        TOKENS,
        ...[...names]
          .filter((n) => !NO_CSS.has(n))
          .map((n) => {
            const spec = cssSpec(n);
            try {
              resolveCss(spec);
            } catch {
              this.error(
                `[painless-haze-css] haze-ui 导出 "${n}" 的 css 注入目标 "${spec}" ` +
                  `在已安装的 haze-ui 包内不存在（css 目录：${cssDir()}）。` +
                  '请在 vite-plugin-haze-css.mts 的 FAMILY（子组件家族归并）' +
                  '或 NO_CSS（JS-only 导出）中登记该导出。'
              );
            }
            return spec;
          })
          // 家族映射令多个组件同落一个 css（Title/Text→typography），按
          // 文件去重——dev 下重复 import 会让浏览器重复加载同一文件
          .filter((f, i, arr) => arr.indexOf(f) === i)
      ];

      const inject = specs.map((f) => `import ${JSON.stringify(f)};`).join('\n');
      return `${inject}\n${code}`;
    }
  };
}
