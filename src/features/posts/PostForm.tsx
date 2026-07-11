import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import type { Category } from '../categories/categories.types'
import { buildSuggestedSlug } from './postIdentifiers'
import { validateWordPressHtml } from './htmlValidation'
import {
  postFormSchema,
  type PostFormInput,
  type PostFormValues,
} from './postFormSchema'
import { getStatusLabel } from './postFormatters'
import {
  contentStatuses,
  type PostDetail,
  type SeoData,
} from './posts.types'

interface PostFormProps {
  mode: 'create' | 'edit'
  categories: Category[]
  post?: PostDetail
  seoData?: SeoData | null
  isSaving: boolean
  submitError: string | null
  submitSuccess?: string | null
  onSubmit: (values: PostFormValues) => Promise<void>
}

export function PostForm({
  mode,
  categories,
  post,
  seoData = null,
  isSaving,
  submitError,
  submitSuccess = null,
  onSubmit,
}: PostFormProps) {
  const [htmlValidationErrors, setHtmlValidationErrors] = useState<string[]>([])
  const initialCategory = categories.find(
    (category) => category.id === post?.category_id,
  )
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
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
      htmlBody: post?.html_body ?? '',
      representativeTitle: seoData?.representative_title ?? '',
      alternativeTitles: getAlternativeTitles(seoData),
      metaDescription: seoData?.meta_description ?? '',
      focusKeyword: seoData?.focus_keyword ?? '',
      imagePrompt: post?.image_prompt ?? '',
      imageAlt: post?.image_alt ?? '',
    },
  })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const briefingDate = useWatch({ control, name: 'briefingDate' })
  const metaDescription = useWatch({ control, name: 'metaDescription' })
  const htmlBody = useWatch({ control, name: 'htmlBody' })
  const contentStatus = useWatch({ control, name: 'contentStatus' })
  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  )
  const disabled = isSaving || isSubmitting
  const statusOptions = mode === 'create'
    ? ['draft']
    : post?.content_status === 'archived'
      ? ['archived']
      : contentStatuses

  async function handleValidSubmit(values: PostFormValues) {
    setHtmlValidationErrors([])

    if (
      mode === 'edit' &&
      values.contentStatus !== 'archived' &&
      values.htmlBody.trim() &&
      selectedCategory
    ) {
      const validationErrors = validateWordPressHtml(
        values.htmlBody,
        selectedCategory.wrapper_class,
        values.imagePrompt,
      )

      if (validationErrors.length > 0) {
        setHtmlValidationErrors(validationErrors)
        setError('htmlBody', { message: validationErrors[0] })
        return
      }
    }

    await onSubmit(values)
  }

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
    <form className="post-form" noValidate onSubmit={handleSubmit(handleValidSubmit)}>
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
          {errors.contentStatus ? (
            <p className="field-error">{errors.contentStatus.message}</p>
          ) : null}
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

      {mode === 'edit' ? (
        <>
          <fieldset className="post-form__section" disabled={disabled}>
            <legend>WordPress 본문 HTML</legend>
            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-html-body">HTML 본문</label>
              <textarea
                id="post-html-body"
                className="post-form__html-editor"
                rows={18}
                spellCheck={false}
                aria-invalid={Boolean(errors.htmlBody)}
                {...register('htmlBody')}
              />
              {errors.htmlBody ? (
                <p className="field-error">{errors.htmlBody.message}</p>
              ) : (
                <p className="field-help">
                  원문 HTML을 그대로 저장하며 실제 HTML로 실행하거나 미리보기하지 않습니다.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="post-form__section" disabled={disabled}>
            <legend>SEO</legend>
            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-representative-title">SEO 대표 제목</label>
              <input
                id="post-representative-title"
                type="text"
                aria-invalid={Boolean(errors.representativeTitle)}
                {...register('representativeTitle')}
              />
              {errors.representativeTitle ? (
                <p className="field-error">{errors.representativeTitle.message}</p>
              ) : null}
            </div>

            {[0, 1, 2, 3].map((index) => (
              <div className="post-form__field" key={index}>
                <label htmlFor={`post-alternative-title-${index + 1}`}>
                  대안 제목 {index + 1}
                </label>
                <input
                  id={`post-alternative-title-${index + 1}`}
                  type="text"
                  {...register(`alternativeTitles.${index}` as const)}
                />
              </div>
            ))}
            {errors.alternativeTitles ? (
              <p className="field-error post-form__field--wide">
                {errors.alternativeTitles.message ?? errors.alternativeTitles.root?.message}
              </p>
            ) : null}

            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-meta-description">메타 설명</label>
              <textarea
                id="post-meta-description"
                rows={4}
                aria-invalid={Boolean(errors.metaDescription)}
                {...register('metaDescription')}
              />
              {errors.metaDescription ? (
                <p className="field-error">{errors.metaDescription.message}</p>
              ) : metaDescription && (metaDescription.length < 120 || metaDescription.length > 160) ? (
                <p className="field-warning" role="status">
                  현재 {metaDescription.length}자입니다. 권장 길이는 120~160자입니다.
                </p>
              ) : (
                <p className="field-help">권장 길이는 120~160자이며 범위를 벗어나도 draft 저장은 가능합니다.</p>
              )}
            </div>

            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-focus-keyword">포커스 키워드</label>
              <input
                id="post-focus-keyword"
                type="text"
                aria-invalid={Boolean(errors.focusKeyword)}
                {...register('focusKeyword')}
              />
              {errors.focusKeyword ? (
                <p className="field-error">{errors.focusKeyword.message}</p>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="post-form__section" disabled={disabled}>
            <legend>대표 이미지 정보</legend>
            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-image-prompt">이미지 프롬프트</label>
              <textarea
                id="post-image-prompt"
                rows={6}
                aria-invalid={Boolean(errors.imagePrompt)}
                {...register('imagePrompt')}
              />
              {errors.imagePrompt ? (
                <p className="field-error">{errors.imagePrompt.message}</p>
              ) : null}
            </div>
            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-image-alt">이미지 ALT 문구</label>
              <input
                id="post-image-alt"
                type="text"
                aria-invalid={Boolean(errors.imageAlt)}
                {...register('imageAlt')}
              />
              {errors.imageAlt ? (
                <p className="field-error">{errors.imageAlt.message}</p>
              ) : (
                <p className="field-help">이미지 파일이나 URL은 저장하지 않습니다.</p>
              )}
            </div>
          </fieldset>

          <section className="post-form__validation" aria-labelledby="post-validation-title">
            <h2 id="post-validation-title">저장 상태와 검증 결과</h2>
            <dl>
              <div><dt>현재 선택 상태</dt><dd>{getStatusLabel(contentStatus)}</dd></div>
              <div><dt>본문 문자 수</dt><dd>{htmlBody.length.toLocaleString('ko-KR')}자</dd></div>
              <div><dt>카테고리 wrapper</dt><dd><code>{selectedCategory?.wrapper_class ?? '확인 불가'}</code></dd></div>
            </dl>
            {htmlValidationErrors.length > 0 ? (
              <div className="validation-errors" role="alert">
                <h3>HTML을 수정해 주세요</h3>
                <ul>
                  {htmlValidationErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            ) : (
              <p className="field-help">HTML이 입력된 draft와 ready·published 저장 시 strict validation을 실행합니다.</p>
            )}
          </section>
        </>
      ) : null}

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

function getAlternativeTitles(seoData: SeoData | null): [string, string, string, string] {
  const values = Array.isArray(seoData?.alternative_titles)
    ? seoData.alternative_titles.filter((value): value is string => typeof value === 'string')
    : []

  return [values[0] ?? '', values[1] ?? '', values[2] ?? '', values[3] ?? '']
}
