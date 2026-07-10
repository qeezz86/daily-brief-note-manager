import type { Category } from '../categories/categories.types'
import {
  formatDateOnly,
  formatUpdatedAt,
  getPostIdentifier,
  getStatusLabel,
} from './postFormatters'
import type { PostListItem } from './posts.types'

interface ContentListProps {
  categories: Category[]
  posts: PostListItem[]
}

export function ContentList({ categories, posts }: ContentListProps) {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <ul className="content-list" aria-label="콘텐츠 목록">
      {posts.map((post) => {
        const category = categoriesById.get(post.category_id)
        const publicationDate = post.published_on ?? post.briefing_date

        return (
          <li key={post.id}>
            <article className="content-card">
              <div className="content-card__heading">
                <div>
                  <p className="content-card__category">
                    {category?.name ?? '알 수 없는 카테고리'}
                  </p>
                  <h2>
                    <Link to={`/content/${post.id}`}>{post.title}</Link>
                  </h2>
                </div>
                <span
                  className={`status-badge status-badge--${post.content_status}`}
                >
                  {getStatusLabel(post.content_status)}
                </span>
              </div>

              <dl className="content-card__details">
                <div>
                  <dt>표시 번호</dt>
                  <dd>{getPostIdentifier(post, category)}</dd>
                </div>
                <div>
                  <dt>발행일</dt>
                  <dd>{formatDateOnly(publicationDate)}</dd>
                </div>
                <div className="content-card__slug">
                  <dt>Slug</dt>
                  <dd>{post.slug}</dd>
                </div>
                <div>
                  <dt>최근 수정</dt>
                  <dd>{formatUpdatedAt(post.updated_at)}</dd>
                </div>
              </dl>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
import { Link } from 'react-router-dom'
