import {Card, Title, Text} from 'haze-ui';

import Feed from './Feed';

// 原有内容（About Native Router 的说明卡）保持不动；下方追加无限滚动
// feed 演示区块（Feed 子组件：数据场景见 services/feed.ts，交互与呈现
// 见 Feed.tsx 文件头）。
export default function About() {
  return (
    <>
      <Card>
        <Title>About Native Router</Title>
        <Text>
          Native Router is another router lib which works like the native browser.
        </Text>
      </Card>
      <Feed />
    </>
  );
}
