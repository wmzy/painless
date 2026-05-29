import {css} from '@linaria/core';
import {useData} from '@native-router/react';
import {Card, Title, Text, Badge, Avatar, Flex} from 'haze-ui';

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
      <Title>Welcome to Painless.</Title>
      <Flex>
        <div>
          {articles.map((a) => (
            <Card key={a.slug}>
              <Flex align='center' gap='sm'>
                <Avatar src={a.author.image} alt={a.author.username} />
                <Text>{a.author.username}</Text>
              </Flex>
              <Title level={2}>
                <PreviewLink to={`/article/${a.slug}`}>{a.title}</PreviewLink>
              </Title>
              <Text>{a.description}</Text>
              <Flex gap='xs' wrap>
                {a.tagList.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </Flex>
            </Card>
          ))}
        </div>
        <Tags />
      </Flex>
    </div>
  );
}
