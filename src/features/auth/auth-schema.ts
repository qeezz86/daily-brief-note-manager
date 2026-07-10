import { z } from 'zod'

export const authFormSchema = z.object({
  email: z.email('올바른 이메일 주소를 입력해 주세요.'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상 입력해 주세요.'),
})

export type AuthFormValues = z.infer<typeof authFormSchema>
