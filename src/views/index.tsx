import {View, HistoryRouter as Router, Route} from 'native-router-react';
import {decode} from 'qss';
import {useMemo} from 'react';
import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {mockViewData} from '@/components/DevTool';
import {articlePageSchema} from '@/types/index.schema';

export default function App() {
  return useMemo(() => {
    const routes = {
      component: () => import('./Layout'),
      children: [
        {
          path: '/',
          data: mockViewData(
            (_0, {location}) => {
              const query = decode(location.search.slice(1));
              return articleService.query(query);
            },
            articlePageSchema,
            'articlePage'
          ),
          component: () => import('./Home')
        },
        {
          path: '/article/:title',
          component: () => import('./Article'),
          data: ({params: {title}}) => articleService.findByTitle(title)
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
  }, []);
}
