import {refresh} from '@native-router/core';
import {Link, useRouter} from '@native-router/react';
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
      <Button onClick={() => refresh(router)}>Refresh</Button>
      <Link to='/'>Home</Link>
    </Card>
  );
}
