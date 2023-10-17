import {css} from '@linaria/core';
import {Link, PrefetchLink, View} from '@native-router/react';

export default function Layout() {
  return (
    <section className={css``}>
      <header
        x-class={css`
          border-bottom: 1px dashed;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 24px;

          > nav > ul {
            display: flex;
            list-style: none;
            gap: 16px;
          }
        `}
      >
        <h1>
          <PrefetchLink
            x-class={css`
              color: #5cb85c;
            `}
            to='/'
          >
            Painless
          </PrefetchLink>
        </h1>
        <nav>
          <ul>
            <li>
              <Link to='/'>Home</Link>
            </li>
            <li>
              <Link to='/help'>Help</Link>
            </li>
            <li>
              <Link to='/about'>About</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main>
        <View />
      </main>
    </section>
  );
}

export const globals = css`
  :global() {
    body {
      margin: 0;
    }
  }
`;
