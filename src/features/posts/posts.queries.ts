import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import {
  archivePost,
  createPost,
  getPostById,
  getPosts,
  getSeoDataByPostId,
  updatePost,
} from './posts.repository'
import type { CreatePostInput, UpdatePostInput } from './posts.types'

export const postQueryKeys = {
  all: ['posts'] as const,
  list: (userId: string) => [...postQueryKeys.all, 'list', userId] as const,
  detail: (userId: string, postId: string) =>
    [...postQueryKeys.all, 'detail', userId, postId] as const,
  seo: (userId: string, postId: string) =>
    [...postQueryKeys.all, 'seo', userId, postId] as const,
}

export function useSeoDataQuery(
  client: DatabaseClient | null,
  userId: string,
  postId: string,
) {
  return useQuery({
    queryKey: postQueryKeys.seo(userId, postId),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase 연결이 설정되지 않았습니다.')
      }

      return getSeoDataByPostId(client, postId)
    },
    enabled: client !== null && userId !== '' && postId !== '',
    retry: false,
  })
}

export function usePostsQuery(
  client: DatabaseClient | null,
  userId: string,
) {
  return useQuery({
    queryKey: postQueryKeys.list(userId),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase 연결이 설정되지 않았습니다.')
      }

      return getPosts(client)
    },
    enabled: client !== null && userId !== '',
  })
}

export function usePostQuery(
  client: DatabaseClient | null,
  userId: string,
  postId: string,
) {
  return useQuery({
    queryKey: postQueryKeys.detail(userId, postId),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase 연결이 설정되지 않았습니다.')
      }

      return getPostById(client, postId)
    },
    enabled: client !== null && userId !== '' && postId !== '',
    retry: false,
  })
}

function requireClient(client: DatabaseClient | null): DatabaseClient {
  if (!client) {
    throw new Error('Supabase 연결이 설정되지 않았습니다.')
  }

  return client
}

export function useCreatePostMutation(
  client: DatabaseClient | null,
  userId: string,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreatePostInput, 'ownerId'>) =>
      createPost(requireClient(client), { ...input, ownerId: userId }),
    onSuccess: (post) => {
      queryClient.setQueryData(
        postQueryKeys.detail(userId, post.id),
        post,
      )
      void queryClient.invalidateQueries({
        queryKey: postQueryKeys.list(userId),
      })
    },
  })
}

export function useUpdatePostMutation(
  client: DatabaseClient | null,
  userId: string,
  postId: string,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdatePostInput) =>
      updatePost(requireClient(client), postId, input),
    onSuccess: (post) => {
      queryClient.setQueryData(
        postQueryKeys.detail(userId, postId),
        post,
      )
      void queryClient.invalidateQueries({
        queryKey: postQueryKeys.list(userId),
      })
      void queryClient.invalidateQueries({
        queryKey: postQueryKeys.seo(userId, postId),
      })
    },
  })
}

export function useArchivePostMutation(
  client: DatabaseClient | null,
  userId: string,
  postId: string,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => archivePost(requireClient(client), postId),
    onSuccess: (post) => {
      queryClient.setQueryData(
        postQueryKeys.detail(userId, postId),
        post,
      )
      void queryClient.invalidateQueries({
        queryKey: postQueryKeys.list(userId),
      })
    },
  })
}
