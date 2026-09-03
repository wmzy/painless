import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, act} from '@testing-library/react';

import Loading from './Loading';

vi.mock('@native-router/core', () => ({
  cancel: vi.fn()
}));

let mockLoading: {key?: string; status?: string} | undefined;
vi.mock('@native-router/react', () => ({
  useLoading: () => mockLoading,
  useRouter: () => ({})
}));

describe('Loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLoading = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when not loading', () => {
    render(<Loading />);
    expect(screen.queryByTestId('loading')).toBeNull();
  });

  it('renders progress bar when loading', () => {
    mockLoading = {key: '1', status: 'pending'};
    render(<Loading />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('loading')).toBeDefined();
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('progress bar has correct ARIA attributes', () => {
    mockLoading = {key: '1', status: 'pending'};
    render(<Loading />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
    expect(progressbar.getAttribute('aria-valuenow')).toBeDefined();
  });

  // 来源：生态评审修复批后置项——pending 分支 cleanup 只 clearInterval
  // 不 remove：pending 中途卸载时灰条容器 div（portal 目标，直挂 body）
  // 残留在文档里，泄漏到组件生命周期之外。
  it('pending 中卸载：灰条容器随卸载从 body 移除，无残留', () => {
    mockLoading = {key: '1', status: 'pending'};
    const {unmount} = render(<Loading />);
    // 灰条渲染在直挂 body 的容器 div 里（portal 目标）
    const host = screen.getByTestId('loading').parentElement!;
    expect(document.body.contains(host)).toBe(true);

    unmount();

    expect(document.body.contains(host)).toBe(false);
  });

  // 来源：生态评审修复批后置项——resolved 分支的 rAF 回调在卸载后仍会
  // setPercent（对已卸载组件的游离状态更新，回调本身是泄漏的调度）；
  // 卸载后不应遗留任何已调度的定时器/动画帧回调。
  it('resolved 中卸载：rAF 与定时器全部取消，无遗留调度', () => {
    mockLoading = {key: '1', status: 'resolved'};
    const {unmount} = render(<Loading />);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
