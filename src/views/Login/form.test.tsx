// 来源：P1 表单层收敛（评审任务）——Login 的共享验证器接线与服务端
// 422 错误回填。Login 视图此前无测试文件，按测试放置规则新建本文件。
// 归并建议：后续若建 src/views/Login/index.test.tsx，可直接把用例并入。
import type {StandardSchemaV1} from '@native-router/react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';

const state = vi.hoisted(() => ({
  router: {pathname: '/login'},
  // /login 的 search 输入（useSearch 的 mock 数据源）：redirect 场景
  // 用例按需注入
  search: {}
}));

// Login 视图只调 auth.login，整体 mock 服务层；422 拒绝值用鸭子形状
// 普通对象（catch 侧按 {status, data.errors} 形状判断）
vi.mock('@/services/auth', () => ({login: vi.fn()}));
vi.mock('@native-router/react', () => ({
  useRouter: () => state.router,
  // 视图接的 useSearch：以真实 schema 校验 mock 的 state.search——
  // 读侧 coerce（非字符串/空串丢弃）在测试里同步生效
  useSearch: (schema: StandardSchemaV1) =>
    (schema['~standard'].validate(state.search) as {value: unknown}).value,
  // 视图里的 <TypedLink> 在 mock 中退化为普通锚点即可
  TypedLink: ({to, children}: {to: string; children: React.ReactNode}) => (
    <a href={to}>{children}</a>
  )
}));
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));

import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';

import Login from './index';

const loginMock = vi.mocked(auth.login);
const navigateMock = vi.mocked(navigate);

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
    // 复验走逐键触发（默认档 reValidateMode='onChange'：react-f0rm 0.7 +
    // haze-ui 1.12.1 起 FormItem control 桥的写值等价 useField.onChange）
    // ——改值即复验换文案，无需失焦
    fill('a@b', 'secret');
    expect(await screen.findByText('Invalid email')).toBeDefined();
    expect(loginMock).not.toHaveBeenCalled();
  });

  // useTitle 接入批（基线铺设见 Home/index.test.tsx 同款注释）
  it('document.title：进入设为 Login · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = render(<Login />);

    expect(document.title).toBe('Login · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });

  it('字段级 mode=onBlur：email 失焦即校验，password 仍提交时校验', async () => {
    render(<Login />);

    // 输入非法邮箱后失焦：email 字段立即报错（不等提交）
    fireEvent.change(screen.getByPlaceholderText('Email'), {target: {value: 'a@b'}});
    fireEvent.blur(screen.getByPlaceholderText('Email'));

    expect(await screen.findByText('Invalid email')).toBeDefined();

    // password 无字段级 mode：既未失焦出错误也无提交，保持安静
    expect(screen.queryByText('Password is required')).toBeNull();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('422 字段错误可对应表单字段：落到字段下方，顶部 Alert 隐藏', async () => {
    // 鸭子形状（fetch-fun HTTPError 映射后：status + data.errors），视图
    // catch 按形状判断，不依赖错误类身份
    loginMock.mockRejectedValueOnce({
      status: 422,
      message: 'password is too short',
      data: {errors: {password: ['is too short']}}
    });
    render(<Login />);

    fill('alice@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    // password 字段下方出现服务端文案（FormItem 的错误 span 渲染），
    // 且服务端错误同样走 aria-invalid + aria-describedby 接线
    expect(await screen.findByText('is too short')).toBeDefined();
    const passwordInput = screen.getByPlaceholderText('Password');
    expect(passwordInput.getAttribute('aria-invalid')).toBe('true');
    const errorEl = document.getElementById(
      passwordInput.getAttribute('aria-describedby')!
    );
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('is too short');
    // 全部错误已回填字段：顶部 Alert 不显示 e.message 整句
    expect(screen.queryByText('password is too short')).toBeNull();
  });

  it('422 字段键对不上表单字段（如 "email or password"）：保留在顶部 Alert', async () => {
    loginMock.mockRejectedValueOnce({
      status: 422,
      message: 'email or password is invalid',
      data: {errors: {'email or password': ['is invalid']}}
    });
    render(<Login />);

    fill('alice@example.com', 'wrong');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    // 回填不了字段的服务端错误按 `${field} ${message}` 拼接兜底到顶部，
    // 避免错误凭空消失
    expect(await screen.findByText('email or password is invalid')).toBeDefined();
  });

  it('非结构化错误（网络故障等）：沿用整句 message 兜底到顶部 Alert', async () => {
    loginMock.mockRejectedValueOnce(new Error('Network down'));
    render(<Login />);

    fill('alice@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));

    expect(await screen.findByText('Network down')).toBeDefined();
  });

  // #11 防重复/防无效提交：disabled = !canSubmit（react-f0rm ≥0.8 的
  // useCanSubmit 复合 flag，= !isSubmitting && !hasErrors）。初始可点是
  // 刻意语义（mode='onSubmit' 下首次校验由提交触发，errors 初始为
  // 空集）——见视图按钮处的 why 注释。复验走逐键触发（默认档
  // reValidateMode='onChange'，桥写值即用户变更）。
  it('提交按钮状态迁移：初始可点→无效提交压下→修复即弹起→提交期再压下', async () => {
    // 手动控制 resolve：让 isSubmitting 覆盖整个异步提交期的窗口可控
    type LoginResult = Awaited<ReturnType<typeof auth.login>>;
    let resolveLogin!: (value: LoginResult) => void;
    loginMock.mockImplementation(
      () => new Promise<LoginResult>((resolve) => (resolveLogin = resolve))
    );
    render(<Login />);
    const submit = screen.getByRole<HTMLButtonElement>('button', {name: 'Login'});

    // 初始可点：尚未校验，errors 为空集
    expect(submit.disabled).toBe(false);

    // 空提交：校验失败落错 → hasErrors 压下按钮
    fireEvent.click(submit);
    expect(await screen.findByText('Email is required')).toBeDefined();
    expect(submit.disabled).toBe(true);

    // 修复两个字段（无失焦）：逐键复验清错，全部清空后按钮弹起
    fill('alice@example.com', 'secret');
    await waitFor(() => expect(submit.disabled).toBe(false));

    // 提交期：isSubmitting 压下（请求在途，防重复提交）
    fireEvent.click(submit);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(loginMock).toHaveBeenCalledTimes(1);

    // 请求完成：isSubmitting 归位，无错误 → 弹起
    await act(async () => {
      resolveLogin(undefined as unknown as LoginResult);
    });
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  // 回归锚点（react-f0rm 0.7.0 + haze-ui 1.12.1 组合行为）：FormItem
  // control 桥的写值等价 useField.onChange——默认档（mode='onSubmit' +
  // reValidateMode='onChange'）下提交失败后直接输入合法值即逐键复验，
  // 错误 span 消失、按钮弹起，全程无失焦、无重提交。0.6.x 时代桥写值
  // 不经 onChange，此场景必须失焦才能复验（曾靠 reValidateMode:'onBlur'
  // 绕过）；该绕过已随升级回收，本用例守住「桥写值即用户变更」不再回退。
  it('桥写值即用户变更：提交失败后直接输入合法值，错误清除、按钮恢复可点（无失焦）', async () => {
    render(<Login />);
    const submit = screen.getByRole<HTMLButtonElement>('button', {name: 'Login'});
    const email = screen.getByPlaceholderText('Email');

    // 空提交：email 落必填错误（role='alert' span），按钮压下
    fireEvent.click(submit);
    expect(await screen.findByText('Email is required')).toBeDefined();
    expect(submit.disabled).toBe(true);

    // 直接输入合法值（不经 blur）：桥写值触发逐键复验，错误 span 消失，
    // aria 链路同步复位
    fireEvent.change(email, {target: {value: 'alice@example.com'}});
    await waitFor(() => expect(screen.queryByText('Email is required')).toBeNull());
    // 无错态：FormItem 声明式 input 桥省略 aria-invalid（ARIA 缺省值即
    // 'false'，与显式 "false" 等价）——render-prop 时代手传布尔会显式
    // 渲染 "false"，断言随之迁移
    expect(email.getAttribute('aria-invalid')).toBeNull();

    // password 仍带错：按钮保持压下；补齐后弹起（按钮弹起不依赖失焦）
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Password'), {target: {value: 'secret'}});
    await waitFor(() => expect(submit.disabled).toBe(false));
  });
});

// 登录后回跳原目的页：requireLogin 守卫写入 ?redirect=<encode(原路径+
// search)>（见 views/index.tsx），Login 经 loginSearchSchema 读回、
// sanitizeRedirect 白名单校验后导航——合法站内路径回原页，非法/缺失落
// 首页。useSearch 已 mock 为真实 schema 校验 state.search，这里注入
// 的就是 URL 解码后的 search 输入形状。
describe('登录后回跳原目的页（redirect）', () => {
  beforeEach(() => {
    state.search = {};
    navigateMock.mockReset();
  });

  // 合法提交：auth.login 成功后视图调 navigate(router, expected)
  async function submitAndExpectNavigate(expected: string) {
    loginMock.mockResolvedValueOnce(
      undefined as unknown as Awaited<ReturnType<typeof auth.login>>
    );
    render(<Login />);
    fill('alice@example.com', 'secret');
    fireEvent.click(screen.getByRole('button', {name: 'Login'}));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(state.router, expected)
    );
  }

  it('带合法 redirect：登录成功导航回原目的页（含 search 深链）', async () => {
    state.search = {redirect: '/editor/my-slug?tab=2'};
    await submitAndExpectNavigate('/editor/my-slug?tab=2');
  });

  it('非法 redirect（协议绝对/协议相对）：防 open redirect，回首页', async () => {
    // https://evil.com：带协议外站地址
    state.search = {redirect: 'https://evil.com'};
    await submitAndExpectNavigate('/');
  });

  it('非法 redirect（协议相对 //evil.com）：回首页', async () => {
    state.search = {redirect: '//evil.com'};
    await submitAndExpectNavigate('/');
  });

  it('无 redirect（直接访问 /login）：回首页', async () => {
    await submitAndExpectNavigate('/');
  });

  it('空串 redirect（schema 读侧丢弃）：回首页', async () => {
    state.search = {redirect: ''};
    await submitAndExpectNavigate('/');
  });
});
