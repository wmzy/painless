// 来源：P1 表单层收敛（评审任务）——Register 的共享验证器接线与服务端
// 422 错误回填（合约必测用例：注册邮箱已占用）。Register 视图此前无
// 测试文件，按测试放置规则新建本文件。
// 归并建议：后续若建 src/views/Register/index.test.tsx，可直接把用例并入。
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

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
    render(<Register />);

    fill('alice', 'alice@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', {name: 'Register'}));

    expect(await screen.findByText('has already been taken')).toBeDefined();
    // 服务端错误同样走 FormItem 的 aria-invalid + aria-describedby 接线
    const emailInput = screen.getByPlaceholderText('Email');
    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    const errorEl = document.getElementById(
      emailInput.getAttribute('aria-describedby')!
    );
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('has already been taken');
    expect(screen.queryByText('email has already been taken')).toBeNull();
  });
});
