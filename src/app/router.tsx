import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom'

import {
  PublicOnlyRoute,
  RequireAuth,
} from '../features/auth/AuthRouteGuards'
import { AppLayout } from '../layouts/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ContentPage } from '../pages/ContentPage'
import { ContentCreatePage } from '../pages/ContentCreatePage'
import { ContentDetailPage } from '../pages/ContentDetailPage'
import { ContentEditPage } from '../pages/ContentEditPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { NewsTopicsPage } from '../pages/NewsTopicsPage'
import { NewsTopicCreatePage } from '../pages/NewsTopicCreatePage'
import { NewsTopicDetailPage } from '../pages/NewsTopicDetailPage'
import { NewsTopicEditPage } from '../pages/NewsTopicEditPage'
import { NewsUpdateCreatePage } from '../pages/NewsUpdateCreatePage'
import { NewsUpdateDetailPage } from '../pages/NewsUpdateDetailPage'
import { NewsUpdateEditPage } from '../pages/NewsUpdateEditPage'
import { NewsFollowupsPage } from '../pages/NewsFollowupsPage'
import { NewsFollowupCreatePage } from '../pages/NewsFollowupCreatePage'
import { NewsFollowupEditPage } from '../pages/NewsFollowupEditPage'

export const routes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: '/login',
        element: <LoginPage />,
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: '/dashboard',
            element: <DashboardPage />,
          },
          {
            path: '/content',
            element: <ContentPage />,
          },
          {
            path: '/content/new',
            element: <ContentCreatePage />,
          },
          {
            path: '/content/:postId',
            element: <ContentDetailPage />,
          },
          {
            path: '/content/:postId/edit',
            element: <ContentEditPage />,
          },
          { path: '/news-topics', element: <NewsTopicsPage /> },
          { path: '/news-topics/new', element: <NewsTopicCreatePage /> },
          { path: '/news-topics/:topicId', element: <NewsTopicDetailPage /> },
          { path: '/news-topics/:topicId/edit', element: <NewsTopicEditPage /> },
          { path: '/content/:postId/news-updates/new', element: <NewsUpdateCreatePage /> },
          { path: '/news-updates/:updateId', element: <NewsUpdateDetailPage /> },
          { path: '/news-updates/:updateId/edit', element: <NewsUpdateEditPage /> },
          { path: '/news-followups', element: <NewsFollowupsPage /> },
          { path: '/news-topics/:topicId/followups/new', element: <NewsFollowupCreatePage /> },
          { path: '/news-followups/:followupId/edit', element: <NewsFollowupEditPage /> },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
