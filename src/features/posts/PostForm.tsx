import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

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
  isBrandTag,
  normalizeTag,
  sourceUrlWarning,
  tagComparisonKey,
  validateHtmlSources,
} from './publicationFields'
import {
  contentStatuses,
  type PostDetail,
  type ChineseMetadata,
  type PostSource,
  type PostTag,
  type SeoData,
} from './posts.types'

interface PostFormProps {
  mode: 'create' | 'edit'
  categories: Category[]
  post?: PostDetail
  seoData?: SeoData | null
  postTags?: PostTag[]
  postSources?: PostSource[]
  chineseMetadata?: ChineseMetadata | null
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
  postTags = [],
  postSources = [],
  chineseMetadata = null,
  isSaving,
  submitError,
  submitSuccess = null,
  onSubmit,
}: PostFormProps) {
  const [htmlValidationErrors, setHtmlValidationErrors] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagInputError, setTagInputError] = useState<string | null>(null)
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
      categoryName: initialCategory?.name ?? '',
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
      tags: postTags.map((tag) => tag.name),
      sources: postSources.map((source) => ({
        sourceName: source.source_name,
        sourceTitle: source.source_title,
        sourceUrl: source.source_url,
        sourcePublishedAt: source.source_published_at
          ? source.source_published_at.slice(0, 16)
          : '',
        checkedPoint: source.checked_point,
      })),
      learningTopic: chineseMetadata?.learning_topic ?? '',
      programName: chineseMetadata?.program_name ?? '',
      originalTitle: chineseMetadata?.original_title ?? '',
      originalUrl: chineseMetadata?.original_url ?? '',
      originalPublishedAt: chineseMetadata?.original_published_at
        ? chineseMetadata.original_published_at.slice(0, 16)
        : '',
      episodeListIncluded: chineseMetadata?.episode_list_included === null || chineseMetadata?.episode_list_included === undefined
        ? ''
        : String(chineseMetadata.episode_list_included) as 'true' | 'false',
      verifiedCoreFact: chineseMetadata?.verified_core_fact ?? '',
      difficulty: chineseMetadata?.difficulty ?? '',
      learningPoints: chineseMetadata?.learning_points ?? '',
    },
  })
  const sourceFields = useFieldArray({ control, name: 'sources' })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const briefingDate = useWatch({ control, name: 'briefingDate' })
  const metaDescription = useWatch({ control, name: 'metaDescription' })
  const htmlBody = useWatch({ control, name: 'htmlBody' })
  const contentStatus = useWatch({ control, name: 'contentStatus' })
  const tags = useWatch({ control, name: 'tags' }) ?? []
  const sources = useWatch({ control, name: 'sources' }) ?? []
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

      if (['ready', 'published'].includes(values.contentStatus)) {
        const sourceErrors = validateHtmlSources(values.htmlBody, values.sources)
        if (sourceErrors.length > 0) {
          setHtmlValidationErrors(sourceErrors)
          setError('htmlBody', { message: sourceErrors[0] })
          return
        }
      }
    }

    await onSubmit(values)
  }

  function addTag() {
    const normalized = normalizeTag(tagInput)
    if (!normalized) return
    const error = isBrandTag(normalized)
      ? 'Daily Brief Note는 태그로 사용할 수 없습니다.'
      : selectedCategory && tagComparisonKey(normalized) === tagComparisonKey(selectedCategory.name)
        ? '카테고리명은 태그로 사용할 수 없습니다.'
        : tagComparisonKey(normalized) === tagComparisonKey(useWatchTitle)
          ? '제목 전체를 태그로 사용할 수 없습니다.'
          : tags.some((tag) => tagComparisonKey(tag) === tagComparisonKey(normalized))
            ? '동일한 태그가 이미 입력되어 있습니다.'
            : null
    if (error) {
      setTagInputError(error)
      return
    }
    setValue('tags', [...tags, normalized], { shouldDirty: true, shouldValidate: true })
    setTagInput('')
    setTagInputError(null)
  }

  const useWatchTitle = useWatch({ control, name: 'title' })

  useEffect(() => {
    setValue(
      'contentGroup',
      (selectedCategory?.content_group ?? '') as PostFormValues['contentGroup'],
    )
    setValue('categoryName', selectedCategory?.name ?? '')
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
      <input type="hidden" {...register('categoryName')} />
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
            <legend>SEO 태그</legend>
            <div className="post-form__field post-form__field--wide">
              <label htmlFor="post-tag-input">태그 추가</label>
              <div className="tag-input-row">
                <input
                  id="post-tag-input"
                  type="text"
                  value={tagInput}
                  aria-invalid={Boolean(tagInputError || errors.tags)}
                  onChange={(event) => { setTagInput(event.target.value); setTagInputError(null) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                />
                <button className="secondary-button" type="button" onClick={addTag}>추가</button>
              </div>
              <p className="field-help">현재 {tags.length}개 · 발행 준비·발행됨은 5~8개</p>
              {tagInputError ? <p className="field-error" role="alert">{tagInputError}</p> : null}
              {errors.tags ? <p className="field-error">{errors.tags.message ?? errors.tags.root?.message}</p> : null}
              {tags.length > 0 ? (
                <ul className="tag-list" aria-label="등록된 태그">
                  {tags.map((tag, index) => (
                    <li key={`${tag}-${index}`}>
                      <span>{tag}</span>
                      <button
                        type="button"
                        aria-label={`${tag} 태그 삭제`}
                        onClick={() => setValue('tags', tags.filter((_, itemIndex) => itemIndex !== index), { shouldDirty: true, shouldValidate: true })}
                      >삭제</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="field-help">등록된 태그가 없습니다.</p>}
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

          {selectedCategory?.content_group === 'chinese' ? (
            <fieldset className="post-form__section" disabled={disabled}>
              <legend>중국어 학습 정보</legend>
              <div className="post-form__field">
                <label htmlFor="chinese-learning-topic">학습 주제</label>
                <input id="chinese-learning-topic" type="text" aria-invalid={Boolean(errors.learningTopic)} {...register('learningTopic')} />
                {errors.learningTopic ? <p className="field-error">{errors.learningTopic.message}</p> : null}
              </div>
              <div className="post-form__field">
                <label htmlFor="chinese-program-name">프로그램명</label>
                <input id="chinese-program-name" type="text" aria-invalid={Boolean(errors.programName)} {...register('programName')} />
                {errors.programName ? <p className="field-error">{errors.programName.message}</p> : null}
              </div>
              <div className="post-form__field post-form__field--wide">
                <label htmlFor="chinese-original-title">CCTV 원문 제목</label>
                <input id="chinese-original-title" type="text" aria-invalid={Boolean(errors.originalTitle)} {...register('originalTitle')} />
                {errors.originalTitle ? <p className="field-error">{errors.originalTitle.message}</p> : null}
              </div>
              <div className="post-form__field post-form__field--wide">
                <label htmlFor="chinese-original-url">CCTV 개별 원문 URL</label>
                <input id="chinese-original-url" type="url" aria-invalid={Boolean(errors.originalUrl)} {...register('originalUrl')} />
                {errors.originalUrl ? <p className="field-error">{errors.originalUrl.message}</p> : null}
              </div>
              <div className="post-form__field">
                <label htmlFor="chinese-original-published-at">원문 게시·업데이트 시각</label>
                <input id="chinese-original-published-at" type="datetime-local" aria-invalid={Boolean(errors.originalPublishedAt)} {...register('originalPublishedAt')} />
                {errors.originalPublishedAt ? <p className="field-error">{errors.originalPublishedAt.message}</p> : <p className="field-help">확인한 실제 시각만 입력하며 날짜만으로 임의 시각을 만들지 않습니다.</p>}
              </div>
              <div className="post-form__field">
                <label htmlFor="chinese-episode-list-included">본편 목록 포함 여부</label>
                <select id="chinese-episode-list-included" aria-invalid={Boolean(errors.episodeListIncluded)} {...register('episodeListIncluded')}>
                  <option value="">미확인</option><option value="true">포함</option><option value="false">미포함</option>
                </select>
                {errors.episodeListIncluded ? <p className="field-error">{errors.episodeListIncluded.message}</p> : null}
              </div>
              <div className="post-form__field post-form__field--wide">
                <label htmlFor="chinese-verified-core-fact">확인한 핵심 사실</label>
                <textarea id="chinese-verified-core-fact" rows={4} aria-invalid={Boolean(errors.verifiedCoreFact)} {...register('verifiedCoreFact')} />
                {errors.verifiedCoreFact ? <p className="field-error">{errors.verifiedCoreFact.message}</p> : null}
              </div>
              <div className="post-form__field">
                <label htmlFor="chinese-difficulty">난이도</label>
                <input id="chinese-difficulty" type="text" {...register('difficulty')} />
              </div>
              <div className="post-form__field post-form__field--wide">
                <label htmlFor="chinese-learning-points">학습 포인트</label>
                <textarea id="chinese-learning-points" rows={4} {...register('learningPoints')} />
              </div>
            </fieldset>
          ) : null}

          <fieldset className="post-form__section" disabled={disabled}>
            <legend>출처 및 참고자료</legend>
            <div className="post-form__field post-form__field--wide source-heading">
              <p className="field-help">현재 {sourceFields.fields.length}개 · 발행 준비·발행됨은 1개 이상</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => sourceFields.append({ sourceName: '', sourceTitle: '', sourceUrl: '', sourcePublishedAt: '', checkedPoint: '' })}
              >출처 추가</button>
              {errors.sources?.root?.message ? <p className="field-error">{errors.sources.root.message}</p> : null}
              {typeof errors.sources?.message === 'string' ? <p className="field-error">{errors.sources.message}</p> : null}
            </div>
            {sourceFields.fields.map((field, index) => {
              const warning = sources[index]?.sourceUrl ? sourceUrlWarning(sources[index].sourceUrl) : null
              const sourceError = errors.sources?.[index]
              return (
                <section className="source-card post-form__field--wide" key={field.id} aria-label={`출처 ${index + 1}`}>
                  <div className="source-card__heading">
                    <h3>출처 {index + 1}</h3>
                    <div>
                      <button type="button" aria-label={`출처 ${index + 1} 위로 이동`} disabled={index === 0} onClick={() => sourceFields.swap(index, index - 1)}>위로</button>
                      <button type="button" aria-label={`출처 ${index + 1} 아래로 이동`} disabled={index === sourceFields.fields.length - 1} onClick={() => sourceFields.swap(index, index + 1)}>아래로</button>
                      <button type="button" aria-label={`출처 ${index + 1} 삭제`} onClick={() => sourceFields.remove(index)}>삭제</button>
                    </div>
                  </div>
                  <div className="source-card__grid">
                    <div className="post-form__field"><label htmlFor={`source-name-${index}`}>출처명</label><input id={`source-name-${index}`} {...register(`sources.${index}.sourceName`)} /></div>
                    <div className="post-form__field"><label htmlFor={`source-title-${index}`}>원문 제목</label><input id={`source-title-${index}`} {...register(`sources.${index}.sourceTitle`)} /></div>
                    <div className="post-form__field post-form__field--wide"><label htmlFor={`source-url-${index}`}>개별 원문 URL</label><input id={`source-url-${index}`} type="url" {...register(`sources.${index}.sourceUrl`)} />{warning ? <p className="field-warning">{warning}</p> : null}</div>
                    <div className="post-form__field"><label htmlFor={`source-published-${index}`}>게시·업데이트 일시</label><input id={`source-published-${index}`} type="datetime-local" {...register(`sources.${index}.sourcePublishedAt`)} /></div>
                    <div className="post-form__field post-form__field--wide"><label htmlFor={`source-checked-${index}`}>확인한 핵심 내용</label><textarea id={`source-checked-${index}`} rows={3} {...register(`sources.${index}.checkedPoint`)} /></div>
                  </div>
                  {sourceError ? <p className="field-error">{sourceError.message ?? sourceError.sourceUrl?.message ?? sourceError.sourcePublishedAt?.message}</p> : null}
                </section>
              )
            })}
          </fieldset>

          <section className="post-form__validation" aria-labelledby="post-validation-title">
            <h2 id="post-validation-title">저장 상태와 검증 결과</h2>
            <dl>
              <div><dt>현재 선택 상태</dt><dd>{getStatusLabel(contentStatus)}</dd></div>
              <div><dt>본문 문자 수</dt><dd>{htmlBody.length.toLocaleString('ko-KR')}자</dd></div>
              <div><dt>카테고리 wrapper</dt><dd><code>{selectedCategory?.wrapper_class ?? '확인 불가'}</code></dd></div>
              <div><dt>태그</dt><dd>{tags.length}개</dd></div>
              <div><dt>출처</dt><dd>{sourceFields.fields.length}개</dd></div>
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
