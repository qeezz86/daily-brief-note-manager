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
  })

export type PostFormValues = z.infer<typeof postFormSchema>
export type PostFormInput = z.input<typeof postFormSchema>
