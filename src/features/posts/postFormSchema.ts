import { z } from 'zod'

import { contentStatuses } from './posts.types'
import {
  isBrandTag,
  isEmptySource,
  isHttpUrl,
  isOfficialCctvArticleUrl,
  MAX_TAG_LENGTH,
  normalizeSourceUrl,
  normalizeTag,
  tagComparisonKey,
} from './publicationFields'

const slugPattern = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/
const difficultyValues = ['beginner', 'intermediate', 'advanced'] as const
const datePattern = /^\d{4}-\d{2}-\d{2}$/

export const postFormSchema = z
  .object({
    categoryId: z.string().trim().min(1, '카테고리를 선택해 주세요.'),
    contentGroup: z.enum(['', 'news', 'ai', 'info_db', 'chinese']),
    categoryName: z.string().default(''),
    title: z.string().trim().min(1, '제목을 입력해 주세요.'),
    summary: z.string().trim().min(1, '요약을 입력해 주세요.'),
    slug: z
      .string()
      .trim()
      .min(1, 'slug를 입력해 주세요.')
      .regex(
        slugPattern,
        'slug는 영문 소문자, 숫자, 단일 하이픈만 사용할 수 있습니다.',
      ),
    contentStatus: z.enum(contentStatuses),
    briefingDate: z.string(),
    publishedOn: z.string(),
    wordpressUrl: z
      .string()
      .trim()
      .refine((value) => {
        if (!value) return true

        try {
          const url = new URL(value)
          return url.protocol === 'http:' || url.protocol === 'https:'
        } catch {
          return false
        }
      }, '올바른 WordPress URL을 입력해 주세요.'),
    htmlBody: z.string(),
    representativeTitle: z.string().trim(),
    alternativeTitles: z.array(z.string().trim()).length(4),
    metaDescription: z.string().trim(),
    focusKeyword: z.string().trim(),
    imagePrompt: z.string().trim(),
    imageAlt: z.string().trim(),
    tags: z.array(z.string()).default([]),
    sources: z.array(z.object({
      sourceName: z.string(),
      sourceTitle: z.string(),
      sourceUrl: z.string(),
      sourcePublishedAt: z.string(),
      checkedPoint: z.string(),
    })).default([]),
    learningTopic: z.string().default(''),
    programName: z.string().default(''),
    originalTitle: z.string().default(''),
    originalUrl: z.string().default(''),
    originalPublishedAt: z.string().default(''),
    episodeListIncluded: z.enum(['', 'true', 'false']).default(''),
    verifiedCoreFact: z.string().default(''),
    difficulty: z.string().default(''),
    learningPoints: z.string().default(''),
    fieldName: z.string().default(''),
    metadataDifficulty: z.enum(['', ...difficultyValues]).default(''),
    estimatedReadMin: z.string().default(''),
    referenceDate: z.string().default(''),
  })
  .superRefine((values, context) => {
    if (values.contentStatus === 'published' && !values.publishedOn) {
      context.addIssue({
        code: 'custom',
        message: '발행됨 상태에는 발행일이 필요합니다.',
        path: ['publishedOn'],
      })
    }

    if (values.contentGroup === 'news' && !values.briefingDate) {
      context.addIssue({
        code: 'custom',
        message: '뉴스 브리핑에는 브리핑 날짜가 필요합니다.',
        path: ['briefingDate'],
      })
    }

    const completedAlternativeTitles = values.alternativeTitles.filter(Boolean)
    const normalizedAlternativeTitles = completedAlternativeTitles.map((title) =>
      title.toLocaleLowerCase('ko-KR'),
    )
    const duplicateAlternativeTitles =
      new Set(normalizedAlternativeTitles).size !== normalizedAlternativeTitles.length

    if (duplicateAlternativeTitles) {
      context.addIssue({
        code: 'custom',
        message: '대안 제목은 서로 달라야 합니다.',
        path: ['alternativeTitles'],
      })
    }

    if (
      values.representativeTitle &&
      normalizedAlternativeTitles.includes(
        values.representativeTitle.toLocaleLowerCase('ko-KR'),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: '대안 제목은 대표 제목과 달라야 합니다.',
        path: ['alternativeTitles'],
      })
    }

    if (values.contentStatus !== 'archived') {
      const normalizedTags = values.tags.map(normalizeTag).filter(Boolean)
      const tagKeys = normalizedTags.map(tagComparisonKey)
      if (new Set(tagKeys).size !== tagKeys.length) {
        context.addIssue({ code: 'custom', message: '동일한 태그가 이미 입력되어 있습니다.', path: ['tags'] })
      }
      normalizedTags.forEach((tag, index) => {
        if (tag.length > MAX_TAG_LENGTH) {
          context.addIssue({ code: 'custom', message: `태그는 ${MAX_TAG_LENGTH}자 이하로 입력해 주세요.`, path: ['tags', index] })
        }
        if (isBrandTag(tag)) {
          context.addIssue({ code: 'custom', message: 'Daily Brief Note는 태그로 사용할 수 없습니다.', path: ['tags', index] })
        }
        if (values.categoryName && tagComparisonKey(tag) === tagComparisonKey(values.categoryName)) {
          context.addIssue({ code: 'custom', message: '카테고리명은 태그로 사용할 수 없습니다.', path: ['tags', index] })
        }
        if (tagComparisonKey(tag) === tagComparisonKey(values.title)) {
          context.addIssue({ code: 'custom', message: '제목 전체를 태그로 사용할 수 없습니다.', path: ['tags', index] })
        }
      })

      const nonEmptySources = values.sources.filter((source) => !isEmptySource(source))
      nonEmptySources.forEach((source) => {
        const sourcePath = values.sources.indexOf(source)
        if (!source.sourceName.trim() || !source.sourceTitle.trim() ||
          !source.sourceUrl.trim() || !source.checkedPoint.trim()) {
          context.addIssue({ code: 'custom', message: '출처 정보를 모두 입력해 주세요.', path: ['sources', sourcePath] })
        } else if (!isHttpUrl(source.sourceUrl)) {
          context.addIssue({ code: 'custom', message: '출처 URL은 절대 HTTP 또는 HTTPS URL이어야 합니다.', path: ['sources', sourcePath, 'sourceUrl'] })
        }
        if (source.sourcePublishedAt && Number.isNaN(Date.parse(source.sourcePublishedAt))) {
          context.addIssue({ code: 'custom', message: '올바른 게시·업데이트 일시를 입력해 주세요.', path: ['sources', sourcePath, 'sourcePublishedAt'] })
        }
      })
      const sourceKeys = nonEmptySources.filter((source) => isHttpUrl(source.sourceUrl)).map((source) => normalizeSourceUrl(source.sourceUrl))
      if (new Set(sourceKeys).size !== sourceKeys.length) {
        context.addIssue({ code: 'custom', message: '출처 URL이 중복되었습니다.', path: ['sources'] })
      }
      if (values.contentGroup === 'chinese' && values.originalUrl.trim() && !isHttpUrl(values.originalUrl)) {
        context.addIssue({ code: 'custom', message: '원문 URL은 절대 HTTP 또는 HTTPS URL이어야 합니다.', path: ['originalUrl'] })
      }
      if (values.contentGroup === 'chinese' && values.originalPublishedAt.trim() && Number.isNaN(Date.parse(values.originalPublishedAt))) {
        context.addIssue({ code: 'custom', message: '올바른 원문 게시·업데이트 시각을 입력해 주세요.', path: ['originalPublishedAt'] })
      }
    }

    const hasMetadataInput = [values.fieldName, values.metadataDifficulty, values.estimatedReadMin, values.referenceDate]
      .some((value) => value.trim())
    if ((values.contentGroup === 'ai' || values.contentGroup === 'info_db') && hasMetadataInput) {
      if (values.fieldName.trim().length > 100) {
        context.addIssue({ code: 'custom', message: '분야는 100자 이하로 입력해 주세요.', path: ['fieldName'] })
      }
      if (values.estimatedReadMin.trim() && !/^[1-9]\d*$/.test(values.estimatedReadMin)) {
        context.addIssue({ code: 'custom', message: '예상 읽기 시간은 1 이상의 정수로 입력해 주세요.', path: ['estimatedReadMin'] })
      } else if (Number(values.estimatedReadMin) > 600) {
        context.addIssue({ code: 'custom', message: '예상 읽기 시간은 600분 이하로 입력해 주세요.', path: ['estimatedReadMin'] })
      }
      if (values.contentGroup === 'info_db' && values.referenceDate.trim() && !datePattern.test(values.referenceDate)) {
        context.addIssue({ code: 'custom', message: '기준일은 YYYY-MM-DD 형식으로 입력해 주세요.', path: ['referenceDate'] })
      }
    }

    if (!['ready', 'published'].includes(values.contentStatus)) return

    const normalizedTags = values.tags.map(normalizeTag).filter(Boolean)
    const completeSources = values.sources.filter((source) => !isEmptySource(source))
    if (normalizedTags.length < 5 || normalizedTags.length > 8) {
      context.addIssue({ code: 'custom', message: '태그는 5개 이상 8개 이하로 입력해 주세요.', path: ['tags'] })
    }
    if (completeSources.length < 1) {
      context.addIssue({ code: 'custom', message: '발행 준비 또는 발행됨 상태에는 출처가 1개 이상 필요합니다.', path: ['sources'] })
    }
    if (values.contentGroup === 'chinese') {
      if (completeSources.some((source) => !source.sourcePublishedAt.trim())) {
        context.addIssue({ code: 'custom', message: '중국어 학습 출처에는 게시·업데이트 일시가 필요합니다.', path: ['sources'] })
      }
      if (!completeSources.some((source) => isOfficialCctvArticleUrl(source.sourceUrl))) {
        context.addIssue({ code: 'custom', message: '중국어 학습에는 공식 CCTV 개별 원문 URL이 필요합니다.', path: ['sources'] })
      }
      if (!values.learningTopic.trim()) context.addIssue({ code: 'custom', message: '학습 주제를 입력해 주세요.', path: ['learningTopic'] })
      if (!values.programName.trim()) context.addIssue({ code: 'custom', message: '프로그램명을 입력해 주세요.', path: ['programName'] })
      if (!values.originalTitle.trim()) context.addIssue({ code: 'custom', message: 'CCTV 원문 제목을 입력해 주세요.', path: ['originalTitle'] })
      if (!values.originalUrl.trim()) {
        context.addIssue({ code: 'custom', message: 'CCTV 개별 원문 URL을 입력해 주세요.', path: ['originalUrl'] })
      } else if (!isOfficialCctvArticleUrl(values.originalUrl)) {
        context.addIssue({ code: 'custom', message: '공식 CCTV 개별 원문 URL을 입력해 주세요.', path: ['originalUrl'] })
      }
      if (!values.originalPublishedAt.trim()) {
        context.addIssue({ code: 'custom', message: '원문 게시·업데이트 시각을 입력해 주세요.', path: ['originalPublishedAt'] })
      } else if (Number.isNaN(Date.parse(values.originalPublishedAt))) {
        context.addIssue({ code: 'custom', message: '올바른 원문 게시·업데이트 시각을 입력해 주세요.', path: ['originalPublishedAt'] })
      }
      if (!values.episodeListIncluded) context.addIssue({ code: 'custom', message: '본편 목록 포함 여부를 명시적으로 선택해 주세요.', path: ['episodeListIncluded'] })
      if (!values.verifiedCoreFact.trim()) context.addIssue({ code: 'custom', message: '확인한 핵심 사실을 입력해 주세요.', path: ['verifiedCoreFact'] })
      if (values.originalUrl.trim() && !completeSources.some((source) => normalizeSourceUrl(source.sourceUrl) === normalizeSourceUrl(values.originalUrl))) {
        context.addIssue({ code: 'custom', message: '중국어 원문 URL과 출처 목록의 URL이 일치하지 않습니다.', path: ['originalUrl'] })
      }
    }
    if (values.contentGroup === 'ai' || values.contentGroup === 'info_db') {
      if (!values.fieldName.trim()) context.addIssue({ code: 'custom', message: '분야를 입력해 주세요.', path: ['fieldName'] })
      if (!values.metadataDifficulty) context.addIssue({ code: 'custom', message: '난이도를 선택해 주세요.', path: ['metadataDifficulty'] })
      if (!values.estimatedReadMin.trim()) context.addIssue({ code: 'custom', message: '예상 읽기 시간을 입력해 주세요.', path: ['estimatedReadMin'] })
    }

    if (!values.htmlBody.trim()) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 WordPress 본문 HTML이 필요합니다.',
        path: ['htmlBody'],
      })
    }
    if (!values.representativeTitle) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 SEO 대표 제목이 필요합니다.',
        path: ['representativeTitle'],
      })
    }
    if (completedAlternativeTitles.length !== 4) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 대안 제목 4개가 필요합니다.',
        path: ['alternativeTitles'],
      })
    }
    if (!values.focusKeyword) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 포커스 키워드가 필요합니다.',
        path: ['focusKeyword'],
      })
    }
    if (!values.metaDescription) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 메타 설명이 필요합니다.',
        path: ['metaDescription'],
      })
    }
    if (!values.imagePrompt) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 이미지 프롬프트가 필요합니다.',
        path: ['imagePrompt'],
      })
    }
    if (!values.imageAlt) {
      context.addIssue({
        code: 'custom',
        message: '발행 준비 또는 발행됨 상태에는 이미지 ALT 문구가 필요합니다.',
        path: ['imageAlt'],
      })
    }
  })

export type PostFormValues = z.infer<typeof postFormSchema>
export type PostFormInput = z.input<typeof postFormSchema>
