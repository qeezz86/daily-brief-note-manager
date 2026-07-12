import { z } from 'zod'
import { newsFollowupPriorities } from './newsFollowups.types'

export const newsFollowupFormSchema = z.object({
  checkText: z.string().trim().min(1, '확인할 내용을 입력해 주세요.'),
  priority: z.enum(newsFollowupPriorities, { error: '올바른 우선순위를 선택해 주세요.' }),
  dueDate: z.string().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), '올바른 마감일을 입력해 주세요.'),
})
export type NewsFollowupFormValues = z.infer<typeof newsFollowupFormSchema>

