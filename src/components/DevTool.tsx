/* eslint-disable no-underscore-dangle */
import * as ee from '@for-fun/event-emitter';
import {css} from '@linaria/core';
import {ReactNode, useEffect, useState} from 'react';
import {refresh} from '@native-router/core';
import {useInject, createMemoryCacheProvider} from 'react-toolroom/async';
import {Button, Card} from 'haze-ui';
import {fakerWhenNothing, schemaFaker} from '@/util/faker';
import Popover from './Popover';

type CacheProvider = ReturnType<typeof createMemoryCacheProvider>;

const emitter = ee.create();

let mockConfig = {} as Record<string, any>;

export function getMockConfigs() {
  return mockConfig;
}

export function getMockConfig(key: string) {
  return mockConfig[key];
}

export function setMockConfig(key: string, config: any) {
  mockConfig = {...mockConfig, [key]: config};
  ee.emit(emitter, 'change');
}

export function onMockConfigChange(cb: () => void) {
  return ee.on(emitter, 'change', cb);
}

type Props = {
  children: ReactNode;
};

function DevToolInner() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(getMockConfigs);

  useEffect(
    () =>
      onMockConfigChange(() => {
        setConfig(getMockConfigs);
      }),
    []
  );

  if (open) {
    return (
      <Popover
        x-class={css`
          width: 300px;
          height: 300px;
          top: 0;
          overflow: auto;
        `}
      >
        <Card>
          <Button onClick={() => setOpen(false)}>Close</Button>
          {Object.entries(config).map(([key, val]) => (
            <MockView
              key={key}
              name={key}
              value={val}
              onChange={(when) => setMockConfig(key, {...val, when})}
            />
          ))}
        </Card>
      </Popover>
    );
  }
  return (
    <Popover
      x-class={css`
        width: 30px;
        height: 30px;
        top: 0;
      `}
    >
      <Button onClick={() => setOpen(true)}>DEV</Button>
    </Popover>
  );
}

function MockView({
  name,
  value,
  onChange
}: {
  name: string;
  value: any;
  onChange?: (when: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <div onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}>
        {['always', 'empty', 'disabled'].map((when) => (
          <label key={when}>
            <input
              name={name}
              type='radio'
              value={when}
              defaultChecked={value.when === when}
            />
            {when}
          </label>
        ))}
      </div>
      <Button onClick={value.refresh}>Refresh</Button>
      <Button onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'} Schema
      </Button>
      <pre x-if={show}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function DevTool({children}: Props) {
  return (
    <>
      {children}
      <DevToolInner />
    </>
  );
}

export function mockViewData<F extends (ctx: any) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string
): F {
  if (import.meta.env.PROD) return fn;

  return ((ctx) => {
    const config = getMockConfig(key);
    const {router, location} = ctx;

    const localConfig = {
      when: 'empty',
      ...config,
      type: 'viewData',
      location,
      schema,
      refresh: () => {
        console.log('refresh');
        refresh(router);
      }
    };

    setMockConfig(key, localConfig);

    if (localConfig.when === 'empty') {
      return fakerWhenNothing(fn, schema)(ctx);
    }

    if (localConfig.when === 'always') {
      return schemaFaker(schema);
    }

    return fn(ctx);
  }) as F;
}

export function useMock<F extends (...params: any[]) => Promise<any>>(
  fn: F,
  schema: unknown,
  key: string,
  cache?: Pick<CacheProvider, 'clear'>
) {
  useInject(fn, ((f: F) => {
    const config = getMockConfig(key);
    return (...args: Parameters<F>) => {
      const localConfig = {
        when: 'empty',
        ...config,
        type: 'async',
        location: null,
        schema,
        refresh: () => {
          cache?.clear();
          fn(...args);
        }
      };

      setMockConfig(key, localConfig);

      if (localConfig.when === 'always') {
        return schemaFaker(schema);
      }
      if (localConfig.when === 'empty') {
        return fakerWhenNothing(f, schema)(...args);
      }
      return f(...args);
    };
  }) as unknown as F);
}
