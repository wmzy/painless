import {css} from '@linaria/core';
import {useSearch, useSetSearch} from '@native-router/react';
import {TagGroup, TagGroupItem, Spinner, Alert, Title} from 'haze-ui';

import {useTagsQuery} from '@/services/dataloaders';
import {homeSearchSchema, homeSearchWriteSchema} from '@/types/search';

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
  // useTagsQuery（场景 hook，声明见 dataloaders.ts）：fetch/cache/initData/
  // mock 全部在场景声明点闭合，调用点只给 args——DevTool 面板的 tagList
  // 条目行为不变
  const {data: tags, loading, error, stale} = useTagsQuery([]);

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
