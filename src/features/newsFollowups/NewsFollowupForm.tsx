import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { newsFollowupFormSchema, type NewsFollowupFormValues } from './newsFollowupFormSchema'
import { newsFollowupPriorities, newsFollowupPriorityLabels } from './newsFollowups.types'

export function NewsFollowupForm({ initial, pending, error, onSubmit }: {
  initial?: NewsFollowupFormValues
  pending: boolean
  error: string | null
  onSubmit: (values: NewsFollowupFormValues) => Promise<void>
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<NewsFollowupFormValues>({
    resolver: zodResolver(newsFollowupFormSchema),
    defaultValues: initial ?? { checkText: '', priority: 'normal', dueDate: '' },
  })
  return <form className="post-form" noValidate onSubmit={handleSubmit(onSubmit)}>
    <section className="post-form__section"><h2>후속 확인 정보</h2>
      <div className="post-form__field"><label htmlFor="followup-check-text">확인할 내용</label><textarea id="followup-check-text" rows={6} {...register('checkText')} />{errors.checkText ? <p className="field-error">{errors.checkText.message}</p> : null}</div>
      <div className="form-grid"><div className="post-form__field"><label htmlFor="followup-priority">우선순위</label><select id="followup-priority" {...register('priority')}>{newsFollowupPriorities.map((value) => <option key={value} value={value}>{newsFollowupPriorityLabels[value]}</option>)}</select>{errors.priority ? <p className="field-error">{errors.priority.message}</p> : null}</div>
      <div className="post-form__field"><label htmlFor="followup-due-date">마감일 (선택)</label><input id="followup-due-date" type="date" {...register('dueDate')} />{errors.dueDate ? <p className="field-error">{errors.dueDate.message}</p> : null}</div></div>
    </section>
    {error ? <p className="form-alert" role="alert">{error}</p> : null}
    <div className="post-form__actions"><button className="primary-button" type="submit" disabled={pending}>{pending ? '저장 중' : '후속 확인 저장'}</button></div>
  </form>
}

