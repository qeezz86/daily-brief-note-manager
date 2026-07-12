import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Category } from '../categories/categories.types'
import { createNewsTopicSchema, editNewsTopicSchema, getTodayInSeoul, type CreateNewsTopicFormValues, type EditNewsTopicFormValues } from './newsTopicFormSchema'
import type { NewsTopic } from './newsTopics.types'

interface Props {
  mode: 'create' | 'edit'
  categories: Category[]
  topic?: NewsTopic
  isSaving: boolean
  submitError: string | null
  onCreate?: (values: CreateNewsTopicFormValues) => Promise<void>
  onEdit?: (values: EditNewsTopicFormValues) => Promise<void>
}

export function NewsTopicForm(props: Props) {
  const today = getTodayInSeoul()
  const createForm = useForm<CreateNewsTopicFormValues>({ resolver: zodResolver(createNewsTopicSchema), defaultValues: { categoryId: '', topicKey: '', canonicalTitle: '', topicSummary: '', initialStatus: 'active', firstSeenAt: today, lastSeenAt: today } })
  const editForm = useForm<EditNewsTopicFormValues>({ resolver: zodResolver(editNewsTopicSchema), defaultValues: { canonicalTitle: props.topic?.canonical_title ?? '', topicSummary: props.topic?.topic_summary ?? '', firstSeenAt: props.topic?.first_seen_at ?? '', lastSeenAt: props.topic?.last_seen_at ?? '' } })
  const form = props.mode === 'create' ? createForm : editForm
  const errors = form.formState.errors
  const submit = props.mode === 'create'
    ? createForm.handleSubmit(async (values) => props.onCreate?.(values))
    : editForm.handleSubmit(async (values) => props.onEdit?.(values))

  return (
    <form className="post-form" noValidate onSubmit={(event) => void submit(event)}>
      <fieldset className="post-form__section">
        <legend>뉴스 주제 기본 정보</legend>
        {props.mode === 'create' ? <>
          <div className="post-form__field"><label htmlFor="topic-category">카테고리</label><select id="topic-category" {...createForm.register('categoryId')} aria-invalid={!!createForm.formState.errors.categoryId}><option value="">선택</option>{props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{createForm.formState.errors.categoryId ? <p className="field-error">{createForm.formState.errors.categoryId.message}</p> : null}</div>
          <div className="post-form__field"><label htmlFor="topic-key">주제 키</label><input id="topic-key" {...createForm.register('topicKey')} aria-invalid={!!createForm.formState.errors.topicKey} placeholder="interest-rate-outlook" />{createForm.formState.errors.topicKey ? <p className="field-error">{createForm.formState.errors.topicKey.message}</p> : <p className="field-help">생성 후 변경할 수 없습니다.</p>}</div>
        </> : <>
          <div className="post-form__field"><label htmlFor="topic-category-readonly">카테고리</label><input id="topic-category-readonly" value={props.categories.find((item) => item.id === props.topic?.category_id)?.name ?? props.topic?.category_id ?? ''} disabled readOnly /></div>
          <div className="post-form__field"><label htmlFor="topic-key-readonly">주제 키</label><input id="topic-key-readonly" value={props.topic?.topic_key ?? ''} disabled readOnly /></div>
        </>}
        <div className="post-form__field post-form__field--wide"><label htmlFor="topic-title">대표 제목</label><input id="topic-title" {...(props.mode === 'create' ? createForm.register('canonicalTitle') : editForm.register('canonicalTitle'))} aria-invalid={!!errors.canonicalTitle} />{errors.canonicalTitle ? <p className="field-error">{errors.canonicalTitle.message}</p> : null}</div>
        <div className="post-form__field post-form__field--wide"><label htmlFor="topic-summary">주제 요약</label><textarea id="topic-summary" {...(props.mode === 'create' ? createForm.register('topicSummary') : editForm.register('topicSummary'))} /></div>
        {props.mode === 'create' ? <div className="post-form__field"><label htmlFor="topic-initial-status">초기 상태</label><select id="topic-initial-status" {...createForm.register('initialStatus')}><option value="active">활성</option><option value="monitoring">모니터링</option></select></div> : null}
        <div className="post-form__field"><label htmlFor="topic-first-seen">최초 확인일</label>{props.mode === 'create' ? <input id="topic-first-seen" type="date" {...createForm.register('firstSeenAt')} /> : <><input id="topic-first-seen" type="date" value={props.topic?.first_seen_at ?? ''} disabled readOnly /><input type="hidden" {...editForm.register('firstSeenAt')} /></>}</div>
        <div className="post-form__field"><label htmlFor="topic-last-seen">최근 확인일</label><input id="topic-last-seen" type="date" {...(props.mode === 'create' ? createForm.register('lastSeenAt') : editForm.register('lastSeenAt'))} aria-invalid={!!errors.lastSeenAt} />{errors.lastSeenAt ? <p className="field-error">{errors.lastSeenAt.message}</p> : null}</div>
      </fieldset>
      {props.submitError ? <p className="form-alert" role="alert">{props.submitError}</p> : null}
      <div className="post-form__actions"><button className="primary-button" type="submit" disabled={props.isSaving}>{props.isSaving ? '저장 중' : '뉴스 주제 저장'}</button></div>
    </form>
  )
}
