import type {Article} from '@/types';
import {css} from '@linaria/core';
import {useData} from 'native-router-react';
import CommentList from './CommentList';

export default function ArticleView() {
  const article = useData() as Article;

  return (
    <div>
      <h1>{article.title}</h1>
      <div>
        {article.body.split('\\n').map((p, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={i}>{p}</p>
        ))}
      </div>
      <CommentList title={article.slug} />
    </div>
  );
}
