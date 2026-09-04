#!/usr/bin/env node
// 口径名：dist JS+CSS gzip 总和（zlib level 9，含懒加载 chunk）。
// 基线：123361 B = 120.47 KB（32 个文件，2026-09-04，Node 24 内置 zlib；
// 本轮增量 -1.07 KB：评审后置项实施批（decisions.md 第 22 条）——本地
// useTitle/stripVolatile/attachPersistence 上移库实现 + AsyncSection 收
// 敛三处视图三分支的净收缩，抵过 notFound 视图与 navigate catch 的新
// 增；数字与 decisions.md 第 22 条同批实测，阈值与
// BASELINE_BYTES 代码不动，仅头注释随批同步）。
// 阈值：126 KB = 129024 B（基线 +10% 余量，取整到 KB）。
//
// 口径必须可复现（项目教训：bundle 增量报告曾出现无任何口径能复现的数字）：
// 逐文件 gzipSync(buf, {level: 9}) 求和。zlib 的 gzip 头不含时间戳（MTIME
// 恒 0），同输入在同版本 Node 上输出逐字节确定——从仓库状态 + Node 版本即
// 可复算，不依赖 vite 汇报的 gzip 列（其舍入口径不可控）。逐文件而非合并
// 成一个流再压：静态服务器本就按文件独立 gzip，合并压缩会吃到跨文件字典
// 红利，数字偏小且无人如此分发。
//
// 递归扫 dist 全目录而非写死 dist/assets/：vite 的产物目录布局随配置走，
// 口径绑定「构建产物里的全部 JS+CSS」这一意图而非某次配置的落点。.map /
// .html / _headers 等按扩展名天然排除。
//
// 求和含懒加载 chunk：预算守的是「发到用户浏览器的总字节」，回归藏在懒加
// 载 chunk 里与藏在入口里同样是回归。
//
// 超限即 exit 1 并输出逐文件明细（gzip 降序，最大嫌疑在前）。增长若是正
// 当的，同一 commit 里更新上方基线与阈值并给出理由——阈值是棘轮不是预算
// 池，10% 余量只为吸收小幅正当增长，不用于吞下无解释的膨胀。
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';

const KB = 1024;
const BASELINE_BYTES = 117679;
const BASELINE_DATE = '2026-08-31';
const THRESHOLD_BYTES = 126 * KB;

// Dirent.path 在 Node 22 存在、24 起更名为 parentPath（旧名移除）；CI 与
// 本地版本都走 parentPath，回退链只为语义完整。
const dist = 'dist';

if (!existsSync(dist)) {
  console.error(`未找到 ${dist}/，先构建再量预算：pnpm build && pnpm run size`);
  process.exit(1);
}

const entries = readdirSync(dist, {recursive: true, withFileTypes: true})
  .filter((e) => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.css')))
  .map((e) => {
    const file = join(e.parentPath ?? e.path ?? '.', e.name);
    const raw = readFileSync(file);
    return {file, raw: raw.length, gz: gzipSync(raw, {level: 9}).length};
  });

// 构建产物里一个 JS/CSS 都没有几乎必然是构建坏了（产物落错目录/清空失
// 败）：直接放行会让预算退化为恒通过的空检查，早抛早查。
if (entries.length === 0) {
  console.error(`${dist}/ 里没有任何 .js/.css 产物，构建疑似异常，先排查 pnpm build`);
  process.exit(1);
}

const totalGz = entries.reduce((sum, e) => sum + e.gz, 0);
const totalRaw = entries.reduce((sum, e) => sum + e.raw, 0);
const kb = (n) => (n / KB).toFixed(2);

if (totalGz <= THRESHOLD_BYTES) {
  const headroom = THRESHOLD_BYTES - totalGz;
  console.log(`✓ 体积预算通过：${kb(totalGz)} KB / ${kb(THRESHOLD_BYTES)} KB（基线 ${kb(BASELINE_BYTES)} KB @ ${BASELINE_DATE} +10%）`);
  console.log(`  JS+CSS 共 ${entries.length} 个文件，raw ${kb(totalRaw)} KB，余量 ${kb(headroom)} KB（${((headroom / THRESHOLD_BYTES) * 100).toFixed(1)}%）`);
  process.exit(0);
}

console.error(`✗ 体积预算超限：${kb(totalGz)} KB > 阈值 ${kb(THRESHOLD_BYTES)} KB（基线 ${kb(BASELINE_BYTES)} KB @ ${BASELINE_DATE} +10%）`);
console.error(`  超出 ${kb(totalGz - THRESHOLD_BYTES)} KB；raw 总和 ${kb(totalRaw)} KB / ${entries.length} 个文件`);
console.error('逐文件明细（gzip 降序）：');
for (const e of entries.sort((a, b) => b.gz - a.gz)) {
  console.error(`  ${kb(e.gz).padStart(8)} KB  ${e.file}`);
}
console.error('增长正当则更新脚本头部基线与阈值（同一 commit 给理由），否则回退引入膨胀的改动。');
process.exit(1);
