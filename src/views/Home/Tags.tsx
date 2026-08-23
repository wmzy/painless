import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useMatched, useSearch} from '@native-router/react';
import {encode} from 'qss';
import {TagGroup, TagGroupItem, Spinner, Alert, Title} from 'haze-ui';

import {useQuery} from '@/util/useQuery';
import * as articleService from '@/services/article';
import {homeSearchSchema} from '@/types/search';
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
    initData: [],
    mock: {schema: tagListSchema, key: 'tagList'}
  });

  const {router} = useMatched();
  const {tag: activeTag} = useSearch(homeSearchSchema);

  // 点 tag 写入 search（由 Home 的 route loader 重新查询），再点同一个则清除
  const toggleTag = (t: string) => {
    void navigate(router, activeTag === t ? '/' : `/?${encode({tag: t})}`);
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
