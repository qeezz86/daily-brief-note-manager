import type { PostFormValues } from './postFormSchema'

function emptyToNull(value: string) {
  return value.trim() || null
}

function htmlToNull(value: string) {
  return value.trim() ? value : null
}

export function toNullablePostFormValues(values: PostFormValues) {
  return {
    ...values,
    briefingDate: emptyToNull(values.briefingDate),
    publishedOn: emptyToNull(values.publishedOn),
    wordpressUrl: emptyToNull(values.wordpressUrl),
    htmlBody: htmlToNull(values.htmlBody),
    imagePrompt: emptyToNull(values.imagePrompt),
    imageAlt: emptyToNull(values.imageAlt),
  }
}
