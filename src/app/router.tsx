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
