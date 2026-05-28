import {css} from '@linaria/core';
import {View} from '@native-router/react';
import {NavigationBar, NavLink, Container, Title} from 'haze-ui';

export default function Layout() {
  return (
    <div>
      <NavigationBar>
        <NavLink to='/'>
          <Title level={3}>Painless</Title>
        </NavLink>
        <NavLink to='/'>Home</NavLink>
        <NavLink to='/help'>Help</NavLink>
        <NavLink to='/about'>About</NavLink>
        <NavLink to='/login'>Login</NavLink>
        <NavLink to='/register'>Register</NavLink>
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
