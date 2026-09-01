// 来源：P1 表单层收敛（评审任务）——Register 的共享验证器接线与服务端
// 422 错误回填（合约必测用例：注册邮箱已占用）。Register 视图此前无
// 测试文件，按测试放置规则新建本文件。
// 归并建议：后续若建 src/views/Register/index.test.tsx，可直接把用例并入。
import type {Author} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';

const state = vi.hoisted(() => ({router: {pathname: '/register'}}));

// Register 视图经 util/validators 的 usernameAvailable 调 auth.fetchProfile
// 查重、直接调 auth.register 提交，整体 mock 服务层；422 拒绝值用鸭子
// 形状普通对象（catch 侧按 {status, data.errors} 形状判断）
vi.mock('@/services/auth', () => ({
  register: vi.fn(),
  fetchProfile: vi.fn()
}));
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
const profileMock = vi.mocked(auth.fetchProfile);

// 第 4 参确认密码默认与密码一致：既有用例不关心一致性校验，保持
// 「填完即可过字段校验」的原语义；一致性差异场景由新用例显式传入。
function fill(username: string, email: string, password: string, confirm = password) {
  fireEvent.change(screen.getByPlaceholderText('Username'), {target: {value: username}});
  fireEvent.change(screen.getByPlaceholderText('Email'), {target: {value: email}});
  fireEvent.change(screen.getByPlaceholderText('Password'), {target: {value: password}});
  fireEvent.change(screen.getByPlaceholderText('Confirm password'), {target: {value: confirm}});
}

beforeEach(() => {
  registerMock.mockReset();
  // 查重基线：404（用户名可用）。不关心查重的用例一律走可用基线，
  // 不因占用分叉；占用 / 网络错场景由异步查重用例显式覆盖
  profileMock.mockReset().mockRejectedValue({status: 404});
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
    // 避开 type='email' 原生约束早退，精确断言自定义验证器。
    // 复验走逐键触发（默认档 reValidateMode='onChange'，桥写值即用户
    // 变更——见 Login/form.test.tsx 的回归锚点用例）——改值即复验换文案
    fill('alice', 'a@b', '123');
    expect(await screen.findByText('Invalid email')).toBeDefined();
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
    expect(registerMock).not.toHaveBeenCalled();
  });

  // useTitle 接入批（基线铺设见 Home/index.test.tsx 同款注释）
  it('document.title：进入设为 Register · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = render(<Register />);

    expect(document.title).toBe('Register · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
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
    // fake timers：提交会先等 username 异步查重的 debounce 窗口（300ms）
    // 走完才发 register 请求，真实定时器会把断言拖到 findByText 超时
    // 边缘；推进假时钟后错误同步可见（fetchProfile mock 即时落定，
    // advanceTimersByTimeAsync 在定时器间冲刷微任务）
    vi.useFakeTimers();
    try {
      render(<Register />);

      fill('alice', 'alice@example.com', 'password123');
      fireEvent.click(screen.getByRole('button', {name: 'Register'}));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
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
  // debounce 窗口 300ms 用 fake timers 推进；fetchProfile 的服务 mock
  // 即时落定（微任务），advanceTimersByTimeAsync 在每个定时器之间冲刷
  // 微任务，校验链路因此能被完整推进；React 状态更新统一包在 act 里
  // 冲净。

  it('用户名异步查重：端点返回占用，错误落字段下方（aria 接线）', async () => {
    // 200：档案存在 → 占用。文案对齐 RealWorld 后端 422 的 username
    // 字段错误，提前暴露与权威回填同句。fetchProfile 的 mock 给解包后
    // 的 Author 形状（值本身不参与断言，只表达「请求成功」）
    profileMock.mockResolvedValueOnce({username: 'admin', bio: null, image: '', following: false});
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      fireEvent.change(username, {target: {value: 'admin'}});
      fireEvent.blur(username);

      // debounce 窗口未走完：请求未发出，不显示错误
      expect(profileMock).not.toHaveBeenCalled();
      expect(screen.queryByText('has already been taken')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // signal 随请求透传到服务层（被超越的轮次据此撤销在途请求）
      expect(profileMock).toHaveBeenCalledWith('admin', expect.any(AbortSignal));
      expect(screen.getByText('has already been taken')).toBeDefined();
      expect(username.getAttribute('aria-invalid')).toBe('true');
      const errorEl = document.getElementById(
        username.getAttribute('aria-describedby')!
      );
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent).toBe('has already been taken');
    } finally {
      vi.useRealTimers();
    }
  });

  // 404 的正向判定：RealWorld 用 404 表达「用户名不存在」→ 可用，
  // 不落任何错误
  it('用户名异步查重：404 视为可用，不落错误', async () => {
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      fireEvent.change(username, {target: {value: 'fresh-user'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(profileMock).toHaveBeenCalledWith('fresh-user', expect.any(AbortSignal));
      expect(screen.queryByText('has already been taken')).toBeNull();
      // 无错态：声明式桥省略 aria-invalid（ARIA 缺省即 'false'）
      expect(username.getAttribute('aria-invalid')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // 网络错 fail-open：查重通道故障绝不阻塞注册——5xx/网络错/超时一律
  // 按结果未知放行（fail-open 的论证见 validators.ts），权威判定留给
  // 提交时的 422 字段回填
  it('用户名异步查重：网络错 fail-open，不落错误且不阻塞提交', async () => {
    profileMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    registerMock.mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof auth.register>>
    );
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      fireEvent.change(username, {target: {value: 'offline-user'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(profileMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('has already been taken')).toBeNull();
      // 无错态：声明式桥省略 aria-invalid（ARIA 缺省即 'false'）
      expect(username.getAttribute('aria-invalid')).toBeNull();

      // 提交不被查重故障阻塞：字段级校验全过（查重放行），注册照发
      fill('offline-user', 'o@example.com', 'password123');
      fireEvent.click(screen.getByRole('button', {name: 'Register'}));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(registerMock).toHaveBeenCalledTimes(1);
      expect(registerMock).toHaveBeenCalledWith(
        'offline-user',
        'o@example.com',
        'password123'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // signal 取消路径的兜底不变量：快速重触发（改值再失焦）时，
  // react-f0rm 在新一轮校验开始即 abort 旧轮 meta.signal——监听 signal
  // 的请求被撤销；这里刻意让旧轮无视 signal（模拟不监听取消的校验方，
  // 即 README「validators that ignore the signal stay correct」的保证），
  // 断言旧轮迟到的「占用」结果被 useValidate 的 lock 机制独立丢弃
  it('用户名异步查重：被新一轮取代的旧轮结果不落错误（lock 丢弃）', async () => {
    let settleOld: (profile: Author) => void = () => undefined;
    profileMock.mockImplementationOnce(
      () =>
        new Promise<Author>((resolve) => {
          settleOld = resolve;
        })
    );
    vi.useFakeTimers();
    try {
      render(<Register />);
      const username = screen.getByPlaceholderText('Username');

      // 第一轮 'admin' 失焦，走完 debounce 窗口：请求在途（不监听 signal）
      fireEvent.change(username, {target: {value: 'admin'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(profileMock).toHaveBeenCalledTimes(1);

      // 快速重触发：改为 'root' 再失焦 → 旧轮 signal 被 abort（在途
      // promise 无视之）、lock 已换新；新轮走基线 404（可用）
      fireEvent.change(username, {target: {value: 'root'}});
      fireEvent.blur(username);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(profileMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('has already been taken')).toBeNull();

      // 旧轮迟到返回「占用」：lock 不匹配，结果被丢弃，不落错误
      await act(async () => {
        settleOld({username: 'admin', bio: null, image: '', following: false});
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.queryByText('has already been taken')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // #11 确认密码：跨字段一致性走 useForm 的 form 级 validate，错误挂到
  // confirmPassword 字段（与其它字段同一条 FormItem role='alert' 链路）；
  // 提交体剔除确认字段（RealWorld 契约只有 username/email/password）。
  it('确认密码不一致：提交报错挂确认字段（aria 链路）、按钮压下；改一致后清除并放行，提交体不含确认字段', async () => {
    // 注册成功路径只关心放行与提交体，返回值用 undefined 占位（视图
    // 只在 navigate 前使用返回值与否无关紧要）
    type RegisterResult = Awaited<ReturnType<typeof auth.register>>;
    registerMock.mockResolvedValue(undefined as unknown as RegisterResult);
    vi.useFakeTimers();
    try {
      render(<Register />);
      const submit = screen.getByRole<HTMLButtonElement>('button', {
        name: 'Register'
      });

      // 初始可点（mode='onSubmit'：首次校验由提交触发，见视图注释）
      expect(submit.disabled).toBe(false);

      // 一致时不报错、正常放行（对照组在用例末尾，先走不一致路径）
      fill('alice', 'alice@example.com', 'password123', 'password12');
      fireEvent.click(submit);
      // 提交先等 username 异步查重的 debounce 窗口（300ms）走完，
      // 字段级全过后才跑 form 级一致性校验
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(screen.getByText('Passwords do not match')).toBeDefined();
      // 确认字段的错误走现有 FormItem 链路：aria-invalid + 指向
      // role='alert' 的 error span
      const confirmInput = screen.getByPlaceholderText('Confirm password');
      expect(confirmInput.getAttribute('aria-invalid')).toBe('true');
      const errorEl = document.getElementById(
        confirmInput.getAttribute('aria-describedby')!
      );
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent).toBe('Passwords do not match');
      // 无效提交被拦：不发请求，canSubmit 的 hasErrors 分量压下按钮
      expect(registerMock).not.toHaveBeenCalled();
      expect(submit.disabled).toBe(true);

      // 改一致（无失焦）：逐键复验清错 → 按钮弹起。
      // 确认字段 validator 是同步的，fireEvent（内含 act）返回时状态已
      // 落定，无需 waitFor（fake timers 下 waitFor 的轮询不会走表）
      fireEvent.change(confirmInput, {target: {value: 'password123'}});
      expect(screen.queryByText('Passwords do not match')).toBeNull();
      expect(submit.disabled).toBe(false);

      // 再次提交：form 级校验通过，注册放行；提交体只有契约三元组，
      // 确认字段不随 values 透传（toHaveBeenCalledWith 断言精确实参）
      fireEvent.click(submit);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(registerMock).toHaveBeenCalledTimes(1);
      expect(registerMock).toHaveBeenCalledWith(
        'alice',
        'alice@example.com',
        'password123'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // validateDeps（react-f0rm ≥0.10）：mismatch 挂上后改 password（而非
  // confirmPassword）也重跑 form 级校验并清错——上一用例钉的是「改确认
  // 字段」路径（字段级复验即可清），本用例钉 form 级依赖重跑路径：改
  // password 使两字段一致，错误随上一轮 form validate 的 footprint 消失，
  // 按钮弹起。此前的显示局限（改 password 不清 mismatch）由本选项消除。
  it('确认密码不一致：改 password（依赖字段）即重跑 form 级校验清除 mismatch', async () => {
    vi.useFakeTimers();
    try {
      render(<Register />);
      const submit = screen.getByRole<HTMLButtonElement>('button', {
        name: 'Register'
      });

      // 提交挂上 mismatch（password 与 confirm 不一致）
      fill('alice', 'alice@example.com', 'password123', 'password12');
      fireEvent.click(submit);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(screen.getByText('Passwords do not match')).toBeDefined();
      expect(submit.disabled).toBe(true);

      // 改 password 到与 confirm 一致（无失焦）：validateDeps 把
      // password 的用户变更接到 form 级重跑，mismatch 清除、按钮弹起。
      // form 级重跑在微任务里落定（异步 act 冲净后断言）
      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('Password'), {
          target: {value: 'password12'}
        });
      });
      expect(screen.queryByText('Passwords do not match')).toBeNull();
      expect(submit.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
