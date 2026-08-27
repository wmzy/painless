// 来源：P1 表单层收敛（评审任务）——Register 的共享验证器接线与服务端
// 422 错误回填（合约必测用例：注册邮箱已占用）。Register 视图此前无
// 测试文件，按测试放置规则新建本文件。
// 归并建议：后续若建 src/views/Register/index.test.tsx，可直接把用例并入。
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';

const state = vi.hoisted(() => ({router: {pathname: '/register'}}));

// Register 视图只调 auth.register，整体 mock 服务层；422 拒绝值用鸭子
// 形状普通对象（catch 侧按 {status, data.errors} 形状判断）
vi.mock('@/services/auth', () => ({register: vi.fn()}));
vi.mock('@native-router/react', () => ({
  useRouter: () => state.router,
  // 视图里的 <TypedLink> 在 mock 中退化为普通锚点即可
  TypedLink: ({to, children}: {to: string; children: React.ReactNode}) => (
    <a href={to}>{children}</a>
  )
}));
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));

import * as auth from '@/services/auth';

import Register from './index';

const registerMock = vi.mocked(auth.register);

function fill(username: string, email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText('Username'), {target: {value: username}});
  fireEvent.change(screen.getByPlaceholderText('Email'), {target: {value: email}});
  fireEvent.change(screen.getByPlaceholderText('Password'), {target: {value: password}});
}

beforeEach(() => {
  registerMock.mockReset();
});

describe('Register 表单', () => {
  it('客户端校验：空提交展示各字段必填，邮箱格式与密码长度各自报文案', async () => {
    render(<Register />);

    fireEvent.click(screen.getByRole('button', {name: 'Register'}));

    expect(await screen.findByText('Username is required')).toBeDefined();
    expect(screen.getByText('Email is required')).toBeDefined();
    expect(screen.getByText('Password is required')).toBeDefined();
    expect(registerMock).not.toHaveBeenCalled();

    // 'a@b' 原生合法但不过应用正则（见 Login/form.test.tsx 同款注释），
    // 避开 type='email' 原生约束早退，精确断言自定义验证器
    fill('alice', 'a@b', '123');
    fireEvent.click(screen.getByRole('button', {name: 'Register'}));
    expect(await screen.findByText('Invalid email')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
    expect(registerMock).not.toHaveBeenCalled();
  });

  // 合约必测：注册邮箱已占用 → 服务端 422 的 email 错误回填到
  // email 字段下方（FormItem 的错误 span 渲染），顶部 Alert 不再显示整句
  it('注册邮箱已占用：422 的 email 错误回填到字段下方，顶部 Alert 隐藏', async () => {
    // 鸭子形状（fetch-fun HTTPError 映射后：status + data.errors），
    // 视图 catch 按形状判断，不依赖错误类身份
    registerMock.mockRejectedValueOnce({
      status: 422,
      message: 'email has already been taken',
      data: {errors: {email: ['has already been taken']}}
    });
    // fake timers：提交会先等 username 异步查重落地（300ms debounce +
    // 400ms 模拟延迟）才发 register 请求，真实定时器会把断言拖到
    // findByText 超时边缘；推进假时钟后错误同步可见
    vi.useFakeTimers();
    try {
      render(<Register />);

      fill('alice', 'alice@example.com', 'password123');
      fireEvent.click(screen.getByRole('button', {name: 'Register'}));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300 + 400);
      });

      expect(screen.getByText('has already been taken')).toBeDefined();
      // 服务端错误同样走 FormItem 的 aria-invalid + aria-describedby 接线
      const emailInput = screen.getByPlaceholderText('Email');
      expect(emailInput.getAttribute('aria-invalid')).toBe('true');
      const errorEl = document.getElementById(
        emailInput.getAttribute('aria-describedby')!
      );
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent).toBe('has already been taken');
      expect(screen.queryByText('email has already been taken')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // —— 用户名异步查重（react-f0rm 异步 validate + AbortSignal）——
  // 模拟端点固定 300ms debounce + 400ms 延迟，用 fake timers 推进。
  // 异步校验与 fake timers 的配合点：advanceTimersByTimeAsync 在每个
  // 定时器之间冲刷微任务，而 react-f0rm 的 waitUntil 是纯事件 + Promise
  // （无定时器轮询），校验链路因此能被完整推进；React 状态更新统一包
  // 在 act 里冲净。

  it('用户名异步查重：失焦后命中保留字，错误落字段下方（aria 接线）', async () => {
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      fireEvent.change(username, {target: {value: 'admin'}});
      fireEvent.blur(username);

      // 请求在途：延迟未到，不显示错误
      expect(screen.queryByText(/is already taken/)).toBeNull();
      await act(async () => {
        // 300ms debounce 后发出请求，再 400ms 模拟延迟返回
        await vi.advanceTimersByTimeAsync(300 + 400);
      });

      expect(screen.getByText("'admin' is already taken")).toBeDefined();
      expect(username.getAttribute('aria-invalid')).toBe('true');
      const errorEl = document.getElementById(
        username.getAttribute('aria-describedby')!
      );
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent).toBe("'admin' is already taken");
    } finally {
      vi.useRealTimers();
    }
  });

  // signal 取消路径：快速重触发（改值再失焦）时，react-f0rm 在新一轮
  // 校验开始即 abort 旧轮 meta.signal → 在途的旧请求被撤销；旧轮即使
  // 有结果也不落错误（校验函数取消 + useValidate lock 双保险）
  it('用户名异步查重：被新一轮取代的旧请求不落错误', async () => {
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      // 第一轮 'admin'（保留字）失焦，走完 debounce 窗口：请求已在途
      fireEvent.change(username, {target: {value: 'admin'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.queryByText(/is already taken/)).toBeNull();

      // 快速重触发：改为 'root' 再失焦 → 旧轮 signal 被 abort，在途的
      // admin 查重取消；最终只有新轮 root 的错误落下
      fireEvent.change(username, {target: {value: 'root'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300 + 400);
      });

      expect(screen.getByText("'root' is already taken")).toBeDefined();
      expect(screen.queryByText("'admin' is already taken")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
