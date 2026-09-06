// 来源：/settings 页（RealWorld 规范视图：更新当前用户 + 登出入口）。
// 口径对齐 Login/Register 表单测试：mock 服务层（auth），真实 react-f0rm
// 表单链路；422 拒绝值用鸭子形状普通对象（catch 侧按
// {status, data.errors} 形状判断）。
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, waitFor} from '@testing-library/react';

const state = vi.hoisted(() => ({router: {pathname: '/settings'}}));

vi.mock('@native-router/react', () => ({
  useRouter: () => state.router
}));
// navigate 返回 Promise：产线对被取代/取消的导航 reject NCE 挂了
// .catch（core 1.15 语义），undefined 会让提交回调同步抛 TypeError
vi.mock('@native-router/core', () => ({
  navigate: vi.fn(async () => undefined),
  invalidate: vi.fn()
}));
vi.mock('@/services/auth', () => ({
  getCurrentUser: vi.fn(),
  updateUser: vi.fn(),
  logoutAndNavigate: vi.fn()
}));

import {invalidate, navigate} from '@native-router/core';

import {renderView} from '@/test-utils';
import {
  getCurrentUser,
  updateUser,
  logoutAndNavigate
} from '@/services/auth';

import Settings from './index';

const navigateMock = vi.mocked(navigate);
const invalidateMock = vi.mocked(invalidate);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const updateUserMock = vi.mocked(updateUser);
const logoutAndNavigateMock = vi.mocked(logoutAndNavigate);

// 同 Article/Editor 测试的 asButton 先例：显式收窄规避 getBy* 在两条
// 类型检查路径下的推断分歧
function asInput(el: HTMLElement): HTMLInputElement {
  return el as HTMLInputElement;
}

function asTextarea(el: HTMLElement): HTMLTextAreaElement {
  return el as HTMLTextAreaElement;
}

const currentUser = {
  username: 'me',
  email: 'me@example.com',
  token: 'jwt',
  bio: 'hi',
  image: 'https://example.com/me.png'
};

const updatedUser = {
  username: 'new me',
  email: 'me@example.com',
  token: 'jwt2',
  bio: null,
  image: null
};

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockImplementation(async () => undefined);
  getCurrentUserMock.mockReturnValue(currentUser);
  updateUserMock.mockResolvedValue(updatedUser);
});

describe('Settings 表单', () => {
  it('初值：username/email/bio/image 预填当前用户值，密码空串', () => {
    renderView(<Settings />);

    expect(asInput(screen.getByPlaceholderText('Username')).value).toBe('me');
    expect(asInput(screen.getByPlaceholderText('Email')).value).toBe(
      'me@example.com'
    );
    expect(asTextarea(screen.getByPlaceholderText('Short bio about you')).value).toBe(
      'hi'
    );
    expect(
      asInput(screen.getByPlaceholderText('URL of profile picture')).value
    ).toBe('https://example.com/me.png');
    expect(asInput(screen.getByPlaceholderText('New Password')).value).toBe('');
  });

  it('客户端校验：username/email 必填与邮箱格式各自报文案，不发请求', async () => {
    renderView(<Settings />);

    fireEvent.change(screen.getByPlaceholderText('Username'), {target: {value: ''}});
    fireEvent.change(screen.getByPlaceholderText('Email'), {target: {value: 'bad'}});
    fireEvent.click(screen.getByRole('button', {name: 'Update Settings'}));

    expect(await screen.findByText('Username is required')).toBeDefined();
    expect(await screen.findByText('Invalid email')).toBeDefined();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('提交成功：载荷归一（空 bio/image → null、空密码省略）、invalidate 先于 navigate 到新档案', async () => {
    updateUserMock.mockResolvedValue(updatedUser);
    renderView(<Settings />);

    fireEvent.change(screen.getByPlaceholderText('Username'), {target: {value: 'new me'}});
    // 清空 bio 与 image：载荷侧归一为 null（RealWorld 的「无简介/无头像」
    // 语义，不是空串）
    fireEvent.change(screen.getByPlaceholderText('Short bio about you'), {target: {value: ''}});
    fireEvent.change(screen.getByPlaceholderText('URL of profile picture'), {target: {value: ''}});
    fireEvent.click(screen.getByRole('button', {name: 'Update Settings'}));

    // 提交经 react-f0rm 校验 → onSubmit 的异步链发起：等调用落地
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
    expect(updateUserMock).toHaveBeenCalledWith({
      username: 'new me',
      email: 'me@example.com',
      bio: null,
      image: null,
      password: undefined
    });
    // 账号可见面变化：invalidate 丢 viewStack 旧快照（对称 Login/Register
    // 提交链），navigate 落服务端权威 username 的新档案——路径段整体
    // encodeURIComponent
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        state.router,
        '/profile/new%20me'
      )
    );
    expect(invalidateMock).toHaveBeenCalledWith(state.router);
    expect(invalidateMock.mock.invocationCallOrder[0]).toBeLessThan(
      navigateMock.mock.invocationCallOrder[0]!
    );
  });

  it('提交成功：非空密码透传（改密码方向）', async () => {
    updateUserMock.mockResolvedValue({...updatedUser, username: 'me'});
    renderView(<Settings />);

    fireEvent.change(screen.getByPlaceholderText('New Password'), {target: {value: 'new-pass'}});
    fireEvent.click(screen.getByRole('button', {name: 'Update Settings'}));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
    expect(updateUserMock).toHaveBeenCalledWith({
      username: 'me',
      email: 'me@example.com',
      bio: 'hi',
      image: 'https://example.com/me.png',
      password: 'new-pass'
    });
  });

  it('服务端 422：email 字段错误回填到字段下方，顶部 Alert 隐藏', async () => {
    updateUserMock.mockRejectedValueOnce({
      status: 422,
      message: 'email has already been taken',
      data: {errors: {email: ['has already been taken']}}
    });
    renderView(<Settings />);

    fireEvent.click(screen.getByRole('button', {name: 'Update Settings'}));

    expect(await screen.findByText('has already been taken')).toBeDefined();
    const emailInput = screen.getByPlaceholderText('Email');
    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    const errorEl = document.getElementById(
      emailInput.getAttribute('aria-describedby')!
    );
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('has already been taken');
    expect(screen.queryByText('email has already been taken')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Logout 入口：委托 logoutAndNavigate(router)（三段链契约见 auth.test）', () => {
    renderView(<Settings />);

    fireEvent.click(screen.getByRole('button', {name: 'Or click here to logout.'}));

    expect(logoutAndNavigateMock).toHaveBeenCalledWith(state.router);
  });

  it('document.title：进入设为 Settings · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = renderView(<Settings />);

    expect(document.title).toBe('Settings · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });
});
