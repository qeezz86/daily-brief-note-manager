import { z } from 'zod'

import { contentStatuses } from './posts.types'

const slugPattern = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/

export const postFormSchema = z
  .object({
    categoryId: z.string().trim().min(1, '카테고리를 선택해 주세요.'),
    contentGroup: z.enum(['', 'news', 'ai', 'info_db', 'chinese']),
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

    if (!['ready', 'published'].includes(values.contentStatus)) return

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
