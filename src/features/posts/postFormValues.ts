import type { PostFormValues } from './postFormSchema'

function emptyToNull(value: string) {
  return value.trim() || null
}

export function toNullablePostFormValues(values: PostFormValues) {
  return {
    ...values,
    briefingDate: emptyToNull(values.briefingDate),
    publishedOn: emptyToNull(values.publishedOn),
    wordpressUrl: emptyToNull(values.wordpressUrl),
  }
}
