import {css} from '@linaria/core';
import {useSearch, useSetSearch} from '@native-router/react';
import {TagGroup, TagGroupItem, Spinner, Alert, Title} from 'haze-ui';

import {tagsCache, useQuery} from '@/util/useQuery';
import * as articleService from '@/services/article';
import {homeSearchSchema, homeSearchWriteSchema} from '@/types/search';
import {tagListSchema} from '@/types/index.schema';

const tagButton = css`
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
`;

const staleAside = css`
  opacity: 0.5;
`;

export default function Tags() {
  const {data: tags, loading, error, stale} = useQuery(articleService.fetchTags, [], {
    cache: tagsCache,
    initData: [],
    mock: {schema: tagListSchema, key: 'tagList'}
  });

  const {tag: activeTag} = useSearch(homeSearchSchema);
  const setSearch = useSetSearch(homeSearchWriteSchema);

  // 点 tag 写入 search（由 Home 的 route loader 重新查询），再点同一个则
  // 清空；undefined 值不是合法的 URL 输入，条件构造而非传 undefined
  const toggleTag = (t: string) => {
    void setSearch(activeTag === t ? {} : {tag: t});
  };

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
    <aside className={stale ? staleAside : undefined}>
      <Title level={3}>Popular Tags</Title>
      <TagGroup>
        {tags.map((t, i) => (
          <button
            key={`${t}-${i}`}
            type='button'
            aria-pressed={activeTag === t}
            className={tagButton}
            onClick={() => toggleTag(t)}
          >
            <TagGroupItem>{t}</TagGroupItem>
          </button>
        ))}
      </TagGroup>
    </aside>
  );
}
