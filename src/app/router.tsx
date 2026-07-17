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
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteErrorFallback } from './RouteErrorFallback'
import { RouteLoadingFallback } from './RouteLoadingFallback'

type LazyRoute = NonNullable<RouteObject['lazy']>

const lazyLoginPage: LazyRoute = () =>
  import('../pages/LoginPage').then(({ LoginPage: Component }) => ({ Component }))
const lazyDashboardPage: LazyRoute = () =>
  import('../pages/DashboardPage').then(({ DashboardPage: Component }) => ({ Component }))
const lazyContentPage: LazyRoute = () =>
  import('../pages/ContentPage').then(({ ContentPage: Component }) => ({ Component }))
const lazyContentCreatePage: LazyRoute = () =>
  import('../pages/ContentCreatePage').then(({ ContentCreatePage: Component }) => ({ Component }))
const lazyContentDetailPage: LazyRoute = () =>
  import('../pages/ContentDetailPage').then(({ ContentDetailPage: Component }) => ({ Component }))
const lazyContentEditPage: LazyRoute = () =>
  import('../pages/ContentEditPage').then(({ ContentEditPage: Component }) => ({ Component }))
const lazyNewsTopicsPage: LazyRoute = () =>
  import('../pages/NewsTopicsPage').then(({ NewsTopicsPage: Component }) => ({ Component }))
const lazyNewsTopicCreatePage: LazyRoute = () =>
  import('../pages/NewsTopicCreatePage').then(({ NewsTopicCreatePage: Component }) => ({ Component }))
const lazyNewsTopicDetailPage: LazyRoute = () =>
  import('../pages/NewsTopicDetailPage').then(({ NewsTopicDetailPage: Component }) => ({ Component }))
const lazyNewsTopicEditPage: LazyRoute = () =>
  import('../pages/NewsTopicEditPage').then(({ NewsTopicEditPage: Component }) => ({ Component }))
const lazyNewsUpdateCreatePage: LazyRoute = () =>
  import('../pages/NewsUpdateCreatePage').then(({ NewsUpdateCreatePage: Component }) => ({ Component }))
const lazyNewsUpdateDetailPage: LazyRoute = () =>
  import('../pages/NewsUpdateDetailPage').then(({ NewsUpdateDetailPage: Component }) => ({ Component }))
const lazyNewsUpdateEditPage: LazyRoute = () =>
  import('../pages/NewsUpdateEditPage').then(({ NewsUpdateEditPage: Component }) => ({ Component }))
const lazyNewsFollowupsPage: LazyRoute = () =>
  import('../pages/NewsFollowupsPage').then(({ NewsFollowupsPage: Component }) => ({ Component }))
const lazyNewsFollowupCreatePage: LazyRoute = () =>
  import('../pages/NewsFollowupCreatePage').then(({ NewsFollowupCreatePage: Component }) => ({ Component }))
const lazyNewsFollowupEditPage: LazyRoute = () =>
  import('../pages/NewsFollowupEditPage').then(({ NewsFollowupEditPage: Component }) => ({ Component }))
const lazyBriefingPromptsPage: LazyRoute = () =>
  import('../pages/BriefingPromptsPage').then(({ BriefingPromptsPage: Component }) => ({ Component }))
const lazyBriefingPromptHistoryPage: LazyRoute = () =>
  import('../pages/BriefingPromptHistoryPage').then(({ BriefingPromptHistoryPage: Component }) => ({ Component }))
const lazyBriefingPromptRunDetailPage: LazyRoute = () =>
  import('../pages/BriefingPromptRunDetailPage').then(({ BriefingPromptRunDetailPage: Component }) => ({ Component }))
const lazyImportPage: LazyRoute = () =>
  import('../pages/ImportPage').then(({ ImportPage: Component }) => ({ Component }))
const lazyImportHistoryPage: LazyRoute = () =>
  import('../pages/ImportHistoryPage').then(({ ImportHistoryPage: Component }) => ({ Component }))
const lazyImportJobDetailPage: LazyRoute = () =>
  import('../pages/ImportJobDetailPage').then(({ ImportJobDetailPage: Component }) => ({ Component }))
const lazyBackupPage: LazyRoute = () =>
  import('../pages/BackupPage').then(({ BackupPage: Component }) => ({ Component }))
const lazyBackupRestorePage: LazyRoute = () =>
  import('../pages/BackupRestorePage').then(({ BackupRestorePage: Component }) => ({ Component }))
const lazyBackupRestoreExecutePage: LazyRoute = () =>
  import('../pages/BackupRestoreExecutePage').then(({ BackupRestoreExecutePage: Component }) => ({ Component }))
const lazyBackupRestoreJobsPage: LazyRoute = () =>
  import('../pages/BackupRestoreJobsPage').then(({ BackupRestoreJobsPage: Component }) => ({ Component }))
const lazyBackupRestoreJobDetailPage: LazyRoute = () =>
  import('../pages/BackupRestoreJobDetailPage').then(({ BackupRestoreJobDetailPage: Component }) => ({ Component }))

function lazyPage(path: string, lazy: LazyRoute): RouteObject {
  return {
    path,
    lazy,
    hydrateFallbackElement: <RouteLoadingFallback />,
    errorElement: <RouteErrorFallback />,
  }
}

export const routes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: '/login',
        lazy: lazyLoginPage,
        hydrateFallbackElement: <RouteLoadingFallback />,
        errorElement: <RouteErrorFallback />,
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
          lazyPage('/dashboard', lazyDashboardPage),
          lazyPage('/content', lazyContentPage),
          lazyPage('/content/new', lazyContentCreatePage),
          lazyPage('/imports', lazyImportPage),
          lazyPage('/imports/new', lazyImportPage),
          lazyPage('/imports/history', lazyImportHistoryPage),
          lazyPage('/imports/history/:jobId', lazyImportJobDetailPage),
          lazyPage('/backups', lazyBackupPage),
          lazyPage('/backups/new', lazyBackupPage),
          lazyPage('/backups/restore', lazyBackupRestorePage),
          lazyPage('/backups/restore/new', lazyBackupRestorePage),
          lazyPage('/backups/restore/execute', lazyBackupRestoreExecutePage),
          lazyPage('/backups/restore/jobs', lazyBackupRestoreJobsPage),
          lazyPage('/backups/restore/jobs/:jobId', lazyBackupRestoreJobDetailPage),
          lazyPage('/content/:postId', lazyContentDetailPage),
          lazyPage('/content/:postId/edit', lazyContentEditPage),
          lazyPage('/news-topics', lazyNewsTopicsPage),
          lazyPage('/news-topics/new', lazyNewsTopicCreatePage),
          lazyPage('/news-topics/:topicId', lazyNewsTopicDetailPage),
          lazyPage('/news-topics/:topicId/edit', lazyNewsTopicEditPage),
          lazyPage('/content/:postId/news-updates/new', lazyNewsUpdateCreatePage),
          lazyPage('/news-updates/:updateId', lazyNewsUpdateDetailPage),
          lazyPage('/news-updates/:updateId/edit', lazyNewsUpdateEditPage),
          lazyPage('/news-followups', lazyNewsFollowupsPage),
          lazyPage('/news-topics/:topicId/followups/new', lazyNewsFollowupCreatePage),
          lazyPage('/news-followups/:followupId/edit', lazyNewsFollowupEditPage),
          lazyPage('/briefing-prompts', lazyBriefingPromptsPage),
          lazyPage('/briefing-prompts/history', lazyBriefingPromptHistoryPage),
          lazyPage('/briefing-prompts/history/:runId', lazyBriefingPromptRunDetailPage),
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
