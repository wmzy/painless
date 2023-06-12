import {useMock} from '@/components/DevTool';
import * as articleService from '@/services/article';
import {css} from '@linaria/core';
import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';
import {tagListSchema} from '@/types/index.schema';

const cache = createMemoryCacheProvider<any, any[]>({
  cacheTime: 10000,
  hash: (k: any[]) => JSON.stringify(k)
});

export default function Tags() {
  const fetchTags = useInjectable(articleService.fetchTags);
  useMock(fetchTags, tagListSchema, 'tagList', cache);
  const isStale = useCache(fetchTags, cache, 2000);
  const tags = useResult(fetchTags, []);
  const loading = useLoading(fetchTags);
  const error = useError(fetchTags);

  useRun(fetchTags, []);

  if (loading) {
    return <aside>loading...</aside>;
  }

  if (error) return <aside>error</aside>;

  return (
    <aside
      x-class={
        isStale &&
        css`
          opacity: 0.5;
        `
      }
    >
      <h1>Popular Tags</h1>
      <ul
        x-class={css`
          display: flex;
          width: 200px;
          flex-wrap: wrap;
          gap: 8px;

          > li {
            list-style: none;
            border: 1px solid #e5e5e5;
            border-radius: 4px;
            padding: 0 8px;
          }
        `}
      >
        {tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </aside>
  );
}
