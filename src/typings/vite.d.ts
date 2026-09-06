/// <reference types="vite/client" />

// interface 声明合并并入 vite/client 的内置 ImportMetaEnv（BASE_URL/DEV/
// PROD…，见 vite/types/importMeta.d.ts）——type 别名无法与 interface 合并，
// 整体覆盖会抹掉内置成员，故此处 interface 是硬要求（disable 该规则的
// 原因）。此前用 type 整体覆盖成空对象，自定义变量只能靠读取点 `as`
// 断言进出（http.ts 的 VITE_API_URL）；合并后 VITE_API_URL 在此钉死
// 真实形态，读取点直接得 string | undefined。ImportMeta 不再本地重复
// 声明——vite/client 自带完整形态（url/env/hot/glob），重复声明零增益。
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
