import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import type { Category } from '../categories/categories.types'
import { buildSuggestedSlug } from './postIdentifiers'
import {
  postFormSchema,
  type PostFormInput,
  type PostFormValues,
} from './postFormSchema'
import { getStatusLabel } from './postFormatters'
import { contentStatuses, type PostDetail } from './posts.types'

interface PostFormProps {
  mode: 'create' | 'edit'
  categories: Category[]
  post?: PostDetail
  isSaving: boolean
  submitError: string | null
  submitSuccess?: string | null
  onSubmit: (values: PostFormValues) => Promise<void>
}

export function PostForm({
  mode,
  categories,
  post,
  isSaving,
  submitError,
  submitSuccess = null,
  onSubmit,
}: PostFormProps) {
  const initialCategory = categories.find(
    (category) => category.id === post?.category_id,
  )
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<PostFormInput, unknown, PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      categoryId: post?.category_id ?? '',
      contentGroup: (initialCategory?.content_group ?? '') as PostFormValues['contentGroup'],
      title: post?.title ?? '',
      summary: post?.summary ?? '',
      slug: post?.slug ?? '',
      contentStatus: (post?.content_status as PostFormValues['contentStatus']) ?? 'draft',
      briefingDate: post?.briefing_date ?? '',
      publishedOn: post?.published_on ?? '',
      wordpressUrl: post?.wordpress_url ?? '',
    },
  })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const briefingDate = useWatch({ control, name: 'briefingDate' })
  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  )
  const disabled = isSaving || isSubmitting
  const statusOptions =
    mode === 'create'
      ? contentStatuses.filter((status) => status !== 'archived')
      : contentStatuses

  useEffect(() => {
    setValue(
      'contentGroup',
      (selectedCategory?.content_group ?? '') as PostFormValues['contentGroup'],
    )
  }, [selectedCategory, setValue])

  useEffect(() => {
    if (
      mode !== 'create' ||
      selectedCategory?.content_group !== 'news' ||
      !briefingDate ||
      dirtyFields.slug
    ) {
      return
    }

    setValue(
      'slug',
      buildSuggestedSlug(selectedCategory, { date: briefingDate }),
    )
  }, [briefingDate, dirtyFields.slug, mode, selectedCategory, setValue])

  return (
    <form className="post-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <input type="hidden" {...register('contentGroup')} />
      <fieldset className="post-form__section" disabled={disabled}>
        <legend>콘텐츠 기본 정보</legend>

        <div className="post-form__field">
          <label htmlFor="post-category">카테고리</label>
          <select
            id="post-category"
            aria-invalid={Boolean(errors.categoryId)}
            disabled={mode === 'edit' || disabled}
            {...register('categoryId')}
          >
            <option value="">선택해 주세요</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId ? (
            <p className="field-error">{errors.categoryId.message}</p>
          ) : null}
          {mode === 'edit' ? (
            <p className="field-help">카테고리는 식별 안정성을 위해 변경할 수 없습니다.</p>
          ) : null}
        </div>

        {selectedCategory?.content_group === 'news' ? (
          <div className="post-form__field">
            <label htmlFor="post-briefing-date">브리핑 날짜</label>
            <input
              id="post-briefing-date"
              type="date"
              aria-invalid={Boolean(errors.briefingDate)}
              disabled={mode === 'edit' || disabled}
              {...register('briefingDate')}
            />
            {errors.briefingDate ? (
              <p className="field-error">{errors.briefingDate.message}</p>
            ) : null}
            {mode === 'edit' ? (
              <p className="field-help">브리핑 날짜는 생성 후 변경할 수 없습니다.</p>
            ) : null}
          </div>
        ) : selectedCategory ? (
          <p className="post-form__notice">
            저장할 때 카테고리별 시리즈 번호가 자동 발급됩니다.
          </p>
        ) : null}

        <div className="post-form__field post-form__field--wide">
          <label htmlFor="post-title">제목</label>
          <input
            id="post-title"
            type="text"
            aria-invalid={Boolean(errors.title)}
            {...register('title')}
          />
          {errors.title ? (
            <p className="field-error">{errors.title.message}</p>
          ) : null}
        </div>

        <div className="post-form__field post-form__field--wide">
          <label htmlFor="post-summary">요약</label>
          <textarea
            id="post-summary"
            rows={6}
            aria-invalid={Boolean(errors.summary)}
            {...register('summary')}
          />
          {errors.summary ? (
            <p className="field-error">{errors.summary.message}</p>
          ) : null}
        </div>

        <div className="post-form__field post-form__field--wide">
          <label htmlFor="post-slug">Slug</label>
          <input
            id="post-slug"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            aria-invalid={Boolean(errors.slug)}
            {...register('slug')}
          />
          {errors.slug ? (
            <p className="field-error">{errors.slug.message}</p>
          ) : (
            <p className="field-help">
              영문 소문자, 숫자, 단일 하이픈만 사용할 수 있습니다.
              {selectedCategory
                ? ` 설정 패턴: ${selectedCategory.slug_pattern}`
                : ''}
            </p>
          )}
        </div>

        <div className="post-form__field">
          <label htmlFor="post-status">상태</label>
          <select id="post-status" {...register('contentStatus')}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>

        <div className="post-form__field">
          <label htmlFor="post-published-on">발행일</label>
          <input
            id="post-published-on"
            type="date"
            aria-invalid={Boolean(errors.publishedOn)}
            {...register('publishedOn')}
          />
          {errors.publishedOn ? (
            <p className="field-error">{errors.publishedOn.message}</p>
          ) : null}
        </div>

        <div className="post-form__field post-form__field--wide">
          <label htmlFor="post-wordpress-url">WordPress URL</label>
          <input
            id="post-wordpress-url"
            type="url"
            aria-invalid={Boolean(errors.wordpressUrl)}
            {...register('wordpressUrl')}
          />
          {errors.wordpressUrl ? (
            <p className="field-error">{errors.wordpressUrl.message}</p>
          ) : null}
        </div>
      </fieldset>

      {submitError ? (
        <p className="form-alert" role="alert">{submitError}</p>
      ) : null}
      {submitSuccess ? (
        <p className="form-success" role="status">{submitSuccess}</p>
      ) : null}

      <div className="post-form__actions">
        <button className="primary-button" type="submit" disabled={disabled}>
          {disabled ? '저장 중' : mode === 'create' ? '콘텐츠 저장' : '변경 사항 저장'}
        </button>
      </div>
    </form>
  )
}
