import { z } from 'zod'
import { newsUpdateTypes } from './newsUpdates.types'

export const newsUpdateFormSchema = z.object({
  topicId: z.string().min(1, '뉴스 주제를 선택해 주세요.'),
  updateType: z.enum(newsUpdateTypes),
  headline: z.string().trim().min(1, '제목을 입력해 주세요.').max(200, '제목은 200자 이하로 입력해 주세요.'),
  factSummary: z.string().trim().min(1, '확인된 사실을 입력해 주세요.').max(4000, '사실 요약은 4,000자 이하로 입력해 주세요.'),
  importanceSummary: z.string(), impactSummary: z.string(), changeSummary: z.string(), previousUpdateId: z.string(),
  sourceIds: z.array(z.string()).min(1, '하나 이상의 출처를 연결해 주세요.'),
}).superRefine((value, context) => {
  if (value.updateType === 'new' && value.previousUpdateId) context.addIssue({ code: 'custom', path: ['previousUpdateId'], message: '신규 업데이트에는 이전 업데이트를 연결할 수 없습니다.' })
  if (value.updateType !== 'new' && !value.previousUpdateId) context.addIssue({ code: 'custom', path: ['previousUpdateId'], message: '후속·정정·종료 메모에는 이전 업데이트가 필요합니다.' })
  if (value.updateType !== 'new' && !value.changeSummary.trim()) context.addIssue({ code: 'custom', path: ['changeSummary'], message: '이전 업데이트와 비교한 변경 내용을 입력해 주세요.' })
})
export type NewsUpdateFormValues = z.infer<typeof newsUpdateFormSchema>

