// 主题 control 的跨树传递：根部（index.tsx 的 Root 组件）创建唯一
// control 实例，经 context 下发；Layout 导航栏的 ThemeToggle 与任何
// 未来接入点（如 DevTool 面板）都从这里取。react-use-control 的
// control 是 hook 返回的 opaque token（无模块级工厂），跨树共享的
// 标准通道就是「根创建 + context 下发」——与 auth 走模块级事件不同，
// 主题是「状态」而非「事件」，control 协议（读+写同一 token）正合适。
import type {Control} from 'react-use-control';

import {createContext, useContext, useEffect, useRef} from 'react';

import {useControl, useThru, mapSetter} from 'react-use-control';

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

// —— 系统档跟随（useAppTheme）：初始主题取自 prefers-color-scheme，且
// 在用户手动干预前持续跟随系统切档（对齐 next-themes 的 system 档；
// 此前 Root 只在首渲染求值一次，系统切换后应用不跟随）——
//
// 手动干预的判定：对下发给消费方（ThemeToggle 等）的 control 包一层
// useThru + mapSetter，在「写通道」上插桩——任何经 control 的写入先
// 标记 manual 再原样透传；系统跟随的写入走 useControl 返回的原生
// setState（不经过包装层），不会误标。ThemeToggle 零改动：它本来就是
// 经 context 拿 control 写值，写的自然是被插桩的那一层。
//
// 会话语义：manual 只记在 ref（本次页面生命周期内），刻意不做跨会话
// localStorage 记忆——持久化需要三态(light/dark/system)状态机 + 首帧
// 同步读存储（防刷新闪烁），模板保持零持久化：每次刷新回到「跟随
// 系统」起点，代价是手动选择不跨会话保留。
//
// StrictMode 双效应安全：matchMedia 监听在 effect 清理函数中成对移除，
// 双挂载（挂载→清理→挂载）后恰好剩一个监听器；manualRef 是组件实例
// 级 ref，双渲染不重置。
export function useAppTheme(): [boolean, Control<boolean>] {
  const manualRef = useRef(false);
  // useControl 首参是「外部 control 或初始值」：实现里 null 会被当成
  // 初始值本身（dark 恒为 null，lazy 函数被丢弃），「新建 control +
  // lazy 初始」要显式传 undefined——这也让 ThemeToggle 的 Switch 状态
  // 链拿到 boolean（role="switch" 的 aria-checked 由 Switch 按 checked
  // 渲染，null 会被 React 省略，axe 报 aria-required-attr）。
  const [dark, setDark, baseControl] = useControl<boolean>(
    undefined,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const themeControl = useThru(
    baseControl,
    mapSetter((v: boolean) => {
      manualRef.current = true;
      return v;
    })
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (!manualRef.current) setDark(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setDark]);
  return [dark, themeControl];
}
