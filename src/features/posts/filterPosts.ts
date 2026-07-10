import type { PostFilters, PostListItem } from './posts.types'

export function filterPosts(
  posts: PostListItem[],
  filters: PostFilters,
): PostListItem[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('ko-KR')

  return posts.filter((post) => {
    if (filters.categoryId && post.category_id !== filters.categoryId) {
      return false
    }

    if (filters.status && post.content_status !== filters.status) {
      return false
    }

    if (!normalizedSearch) {
      return true
    }

    return [post.title, post.slug].some((value) =>
      value.toLocaleLowerCase('ko-KR').includes(normalizedSearch),
    )
  })
}
