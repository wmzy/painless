import type {AppPaths} from '@/views';

import {refresh} from '@native-router/core';
import {TypedLink, useRouter} from '@native-router/react';
import {Card, Title, Text, Button} from 'haze-ui';


type Props = {
  error: Error;
};

export default function RouterError({error}: Props) {
  const router = useRouter();
  return (
    <Card>
      <Title>Error</Title>
      <Text>{error.message}</Text>
      <pre>{error.stack}</pre>
      <Button onClick={() => void refresh(router)}>Refresh</Button>
      <TypedLink<AppPaths> to='/'>Home</TypedLink>
    </Card>
  );
}
