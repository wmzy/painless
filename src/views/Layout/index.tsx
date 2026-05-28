import {css} from '@linaria/core';
import {View} from '@native-router/react';
import {NavigationBar, NavLink, Container, Title} from 'haze-ui';

export default function Layout() {
  return (
    <div>
      <NavigationBar>
        <NavLink href='/'>
          <Title level={3}>Painless</Title>
        </NavLink>
        <NavLink href='/'>Home</NavLink>
        <NavLink href='/help'>Help</NavLink>
        <NavLink href='/about'>About</NavLink>
        <NavLink href='/login'>Login</NavLink>
        <NavLink href='/register'>Register</NavLink>
      </NavigationBar>
      <Container>
        <View />
      </Container>
    </div>
  );
}

export const globals = css`
  :global() {
    body {
      margin: 0;
    }
  }
`;
