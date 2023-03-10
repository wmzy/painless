import {View, HistoryRouter as Router, Route} from 'native-router-react';
import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {decode} from 'qss';

export default function App() {
  const routes = {
    component: () => import('./Layout'),
    children: [
      {
        path: '/',
        data: (_0, {location}) => {
          const query = decode(location.search.slice(1));
          return articleService.query(query);
        },
        component: () => import('./Home')
      },
      {
        path: '/article/:title',
        component: () => import('./Article'),
        data: ({title}) => articleService.findByTitle(title)
      },
      {
        path: '/help',
        component: () => import('./Help')
      },
      {
        path: '/about',
        component: () => import('./About')
      }
    ]
  } as Route;

  return (
    <Router
      routes={routes}
      // baseUrl={import.meta.env.BASE_URL.slice(0, -1)}
      // eslint-disable-next-line react/no-unstable-nested-components
      errorHandler={(e) => <RouterError error={e} />}
    >
      <View />
      <Loading />
    </Router>
  );
}
