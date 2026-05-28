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
import {TagGroup, TagGroupItem, Spinner, Alert, Title} from 'haze-ui';
import {useMock} from '@/components/DevTool';
import * as articleService from '@/services/article';
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
    return (
      <aside>
        <Spinner />
      </aside>
    );
  }

  if (error) {
    return (
      <aside>
        <Alert variant='danger'>Failed to load tags</Alert>
      </aside>
    );
  }

  return (
    <aside
      x-class={
        isStale &&
        css`
          opacity: 0.5;
        `
      }
    >
      <Title level={3}>Popular Tags</Title>
      <TagGroup>
        {tags.map((t) => (
          <TagGroupItem key={t}>{t}</TagGroupItem>
        ))}
      </TagGroup>
    </aside>
  );
}
