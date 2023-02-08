import {css} from '@linaria/core';
import {useData} from 'native-router-react';
import {ArticlePage} from '@/types';
import PreviewLink from '@/components/PreviewLink';
import Tags from './Tags';

export default function Home() {
  const {articles} = useData() as ArticlePage;

  return (
    <div
      className={css`
        text-align: center;
      `}
    >
      <h1>Welcome to Painless.</h1>
      <div
        x-class={css`
          display: flex;
        `}
      >
        <div>
          {articles.map((a) => (
            <div key={a.slug}>
              <h2>
                <PreviewLink to={`/article/${a.slug}`}>{a.title}</PreviewLink>
              </h2>
            </div>
          ))}
        </div>
        <Tags />
      </div>
    </div>
  );
}
