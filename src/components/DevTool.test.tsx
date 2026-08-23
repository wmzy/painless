import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useState} from 'react';

import {stableHash} from 'react-toolroom/async';

import {queryCache} from '@/util/useQuery';

import DevTool, {truncateKey, ageSeconds} from './DevTool';

// 沿用 RouterError.test.tsx 的 haze-ui mock 约定；DevTool 对 useControl 均为
// 非受控用法（useControl(undefined, initial)），用 useState 等价替身驱动面板开合。
vi.mock('haze-ui', () => ({
  Button: ({children, onClick}: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({children}: any) => <div>{children}</div>,
  useControl: <T,>(_control: unknown, initial: T) =>
    useState<T>(typeof initial === 'function' ? (initial as () => T)() : initial)
}));

function openPanel() {
  render(
    <DevTool>
      <div>content</div>
    </DevTool>
  );
  fireEvent.click(screen.getByText('DEV'));
}

describe('DevTool truncateKey', () => {
  it('keeps short hash keys as-is', () => {
    expect(truncateKey('["tag"]')).toBe('["tag"]');
  });

  it('keeps keys exactly at the limit', () => {
    expect(truncateKey('x'.repeat(24))).toBe('x'.repeat(24));
  });

  it('truncates keys longer than 24 chars', () => {
    const key = '["0123456789012345678901234567890"]';
    expect(truncateKey(key)).toBe(`${key.slice(0, 24)}…`);
  });
});

describe('DevTool ageSeconds', () => {
  it('floors the elapsed time to whole seconds', () => {
    expect(ageSeconds(1000, 1999)).toBe(0);
    expect(ageSeconds(1000, 2000)).toBe(1);
  });

  it('clamps clock-skew negatives to 0', () => {
    expect(ageSeconds(5000, 1000)).toBe(0);
  });
});

describe('DevTool CacheView', () => {
  beforeEach(() => {
    // queryCache 是模块级单例，逐用例清空隔离
    queryCache.clear();
  });

  it('shows zero entries when the cache is empty', () => {
    openPanel();
    expect(screen.getByText('Cache: 0')).toBeDefined();
  });

  it('shows the entry count, hashed key and age from snapshot()', () => {
    queryCache.set(['tag'], {items: []});
    openPanel();
    expect(screen.getByText('Cache: 1')).toBeDefined();
    // key 格式归 useQuery 的 hashArgs 所有（stableHash，如 [s:tag]），
    // 此处用同一公开函数计算期望值，不硬编码形态
    expect(screen.getByTitle(stableHash(['tag'])).textContent).toBe(
      `${stableHash(['tag'])} · 0s`
    );
  });

  it('truncates long keys and keeps the full one in title', () => {
    const args = ['0123456789012345678901234567890'];
    const key = stableHash(args);
    queryCache.set(args, 1);
    openPanel();
    expect(screen.getByTitle(key).textContent).toBe(`${key.slice(0, 24)}… · 0s`);
  });

  it('clears the shared cache via the Clear button', () => {
    queryCache.set(['tag'], {items: []});
    openPanel();
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getByText('Cache: 0')).toBeDefined();
    expect(queryCache.snapshot?.()).toEqual([]);
  });
});
