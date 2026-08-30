import {css} from '@linaria/core';
import {useSearch, useSetSearch} from '@native-router/react';
import {TagGroup, TagGroupItem, Spinner, Alert, Title} from 'haze-ui';

import {useTagsQuery} from '@/services/dataloaders';
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
  // useTagsQuery（createDataLoader 第三元素，声明见 dataloaders.ts）：
  // fetch/cache 由 loader 声明绑定，mock 经 opts 透传（useQuery 的
  // mock 配置项——DevTool 面板的 tagList 条目行为不变）
  const {data: tags, loading, error, stale} = useTagsQuery([], {
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
