import { z } from 'zod'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const topicKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createNewsTopicSchema = z.object({
  categoryId: z.string().min(1, '뉴스 카테고리를 선택해 주세요.'),
  topicKey: z.string().trim().min(1, '주제 키를 입력해 주세요.').regex(topicKeyPattern, '주제 키는 영문 소문자, 숫자, 단일 하이픈만 사용할 수 있습니다.'),
  canonicalTitle: z.string().trim().min(1, '대표 제목을 입력해 주세요.'),
  topicSummary: z.string(),
  initialStatus: z.enum(['active', 'monitoring']),
  firstSeenAt: z.string().regex(datePattern, '최초 확인일을 입력해 주세요.'),
  lastSeenAt: z.string().regex(datePattern, '최근 확인일을 입력해 주세요.'),
}).superRefine((value, context) => {
  if (value.lastSeenAt < value.firstSeenAt) context.addIssue({ code: 'custom', path: ['lastSeenAt'], message: '최근 확인일은 최초 확인일보다 이전일 수 없습니다.' })
})

export const editNewsTopicSchema = z.object({
  canonicalTitle: z.string().trim().min(1, '대표 제목을 입력해 주세요.'),
  topicSummary: z.string(),
  lastSeenAt: z.string().regex(datePattern, '최근 확인일을 입력해 주세요.'),
  firstSeenAt: z.string(),
}).superRefine((value, context) => {
  if (value.lastSeenAt < value.firstSeenAt) context.addIssue({ code: 'custom', path: ['lastSeenAt'], message: '최근 확인일은 최초 확인일보다 이전일 수 없습니다.' })
})

export type CreateNewsTopicFormValues = z.infer<typeof createNewsTopicSchema>
export type EditNewsTopicFormValues = z.infer<typeof editNewsTopicSchema>

export function getTodayInSeoul() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
