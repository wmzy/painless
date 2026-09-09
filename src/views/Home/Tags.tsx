import {css} from '@linaria/core';
import {useSearch} from '@native-router/react';
import {TagGroup, TagGroupItem, Title, AsyncSection} from 'haze-ui';

import {useTagsQuery} from '@/services/dataloaders';
import {homeSearchSchema} from '@/types/search';

import {useSetHomeSearch} from './useSetHomeSearch';

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
  // 场景 hook（声明见 dataloaders.ts）：调用点只给 args——DevTool 面板的
  // tagList 条目行为不变。
  const {data: tags, loading, error, stale, refetch} = useTagsQuery([]);

  const {tag: activeTag} = useSearch(homeSearchSchema);
  const setSearch = useSetHomeSearch();

  // 再点同一个则清空；{replace: true}：tag 筛选是过滤面而非导航面——back
  // 不逐条回放筛选态（连点三个 tag 不堆三条 history），与分页 TypedLink
  // 的 push 是刻意并存的两种语义。
  const toggleTag = (t: string) => {
    void setSearch(activeTag === t ? {} : {tag: t}, {replace: true});
  };

  // AsyncSection 三分支；Retry 调 refetch（绕过缓存重拉，loading 复归）。
  // stale 半透明挂在常驻 aside 上——loading/error 期 stale 恒 false。
  return (
    <aside className={stale ? staleAside : undefined}>
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        errorText='Failed to load tags'
      >
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
      </AsyncSection>
    </aside>
  );
}
