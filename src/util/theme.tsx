// 主题 control 的跨树传递：根部（index.tsx 的 Root 组件）创建唯一
// control 实例，经 context 下发；Layout 导航栏的 ThemeToggle 与任何
// 未来接入点（如 DevTool 面板）都从这里取。react-use-control 的
// control 是 hook 返回的 opaque token（无模块级工厂），跨树共享的
// 标准通道就是「根创建 + context 下发」——与 auth 走模块级事件不同，
// 主题是「状态」而非「事件」，control 协议（读+写同一 token）正合适。
import type {Control} from 'react-use-control';

import {createContext, useContext} from 'react';

export const ThemeControlCtx = createContext<Control<boolean> | null>(null);

// 取根部的主题 control（true = dark）。必须在 ThemeControlCtx.Provider
// 内使用；缺失即接线错误，直接抛。
export function useThemeControl(): Control<boolean> {
  const control = useContext(ThemeControlCtx);
  if (!control) {
    throw new Error('useThemeControl must be used within ThemeControlCtx');
  }
  return control;
}
