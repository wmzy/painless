// 来源：P1 表单层收敛（评审任务）——Login 的共享验证器接线与服务端
// 422 错误回填。Login 视图此前无测试文件，按测试放置规则新建本文件。
// 归并建议：后续若建 src/views/Login/index.test.tsx，可直接把用例并入。
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

const state = vi.hoisted(() => ({router: {pathname: '/login'}}));

// Login 视图只调 auth.login，整体 mock 服务层；ApiError 用真实类构造
vi.mock('@/services/auth', () => ({login: vi.fn()}));
vi.mock('@native-router/react', () => ({
  useRouter: () => state.router,
  // 视图里的 <Link> 在 mock 中退化为普通锚点即可
  Link: ({to, children}: {to: string; children: React.ReactNode}) => (
    <a href={to}>{children}</a>
  )
}));
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));

import * as auth from '@/services/auth';
import {ApiError} from '@/util/http';

import Login from './index';

const loginMock = vi.mocked(auth.login);

function fill(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText('Email'), {target: {value: email}});
  fireEvent.change(screen.getByPlaceholderText('Password'), {target: {value: password}});
}

beforeEach(() => {
  loginMock.mockReset();
});

describe('Login 表单', () => {
  it('客户端校验：空提交展示必填错误且不发请求，邮箱格式错误单独报文案', async () => {
    render(<Login />);

    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    expect(await screen.findByText('Email is required')).toBeDefined();
    expect(screen.getByText('Password is required')).toBeDefined();
    expect(loginMock).not.toHaveBeenCalled();

    // 注意：type='email' 的原生约束会先于 f0rm 验证器（formEl.checkValidity
    // 失败时 f0rm 直接早退走原生提示）。'a@b' 原生合法但不过应用正则
    // /\S+@\S+\.\S+/（域名无点号），恰好精确断言自定义验证器生效。
    fill('a@b', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));
    expect(await screen.findByText('Invalid email')).toBeDefined();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('422 字段错误可对应表单字段：落到字段下方，顶部 Alert 隐藏', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError(422, 'password is too short', {password: ['is too short']})
    );
    render(<Login />);

    fill('alice@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    // password 字段下方出现服务端文案（FieldError 渲染）
    expect(await screen.findByText('is too short')).toBeDefined();
    // 全部错误已回填字段：顶部 Alert 不显示 e.message 整句
    expect(screen.queryByText('password is too short')).toBeNull();
  });

  it('422 字段键对不上表单字段（如 "email or password"）：保留在顶部 Alert', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError(422, 'email or password is invalid', {
        'email or password': ['is invalid']
      })
    );
    render(<Login />);

    fill('alice@example.com', 'wrong');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    // 回填不了字段的服务端错误按 `${field} ${message}` 拼接兜底到顶部，
    // 避免错误凭空消失
    expect(await screen.findByText('email or password is invalid')).toBeDefined();
  });

  it('非 ApiError：沿用整句 message 兜底到顶部 Alert', async () => {
    loginMock.mockRejectedValueOnce(new Error('Network down'));
    render(<Login />);

    fill('alice@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    expect(await screen.findByText('Network down')).toBeDefined();
  });
});
