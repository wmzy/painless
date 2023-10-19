import * as ee from '@for-fun/event-emitter';
import {css} from '@linaria/core';
import {ReactNode, useEffect, useState} from 'react';
import {refresh} from '@native-router/core';
import {useInject, createMemoryCacheProvider} from 'react-toolroom/async';
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
          background: white;
        `}
      >
        <div>
          <button type='button' onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {Object.entries(config).map(([key, val]) => (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          <MockView
            key={key}
            name={key}
            value={val}
            onChange={(e) => setMockConfig(key, {...val, when: e.target.value})}
          />
        ))}
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
      <button type='button' onClick={() => setOpen(true)}>
        DEV
      </button>
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
  onChange?: (value: any) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <div onChange={onChange}>
        {['always', 'empty', 'disabled'].map((when) => (
          // eslint-disable-next-line jsx-a11y/label-has-associated-control
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
        <button type='button' onClick={value.refresh}>
          Refresh
        </button>
      </div>
      <button type='button' onClick={() => setShow(!show)}>
        {show ? 'Hide' : 'Show'} Schema
      </button>
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
