import type { PostFormValues } from './postFormSchema'
import { publicationTimestamp, sourceTimeZone } from './publicationDates'

function emptyToNull(value: string) {
  return value.trim() || null
}

function htmlToNull(value: string) {
  return value.trim() ? value : null
}

function positiveIntegerToNull(value: string) {
  return value.trim() ? Number(value) : null
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
    learningTopic: emptyToNull(values.learningTopic),
    programName: emptyToNull(values.programName),
    originalTitle: emptyToNull(values.originalTitle),
    originalUrl: emptyToNull(values.originalUrl),
    originalPublishedAt: publicationTimestamp(values.originalPublishedAt, 'Asia/Shanghai'),
    episodeListIncluded: values.episodeListIncluded === ''
      ? null
      : values.episodeListIncluded === 'true',
    verifiedCoreFact: emptyToNull(values.verifiedCoreFact),
    difficulty: emptyToNull(values.difficulty),
    learningPoints: emptyToNull(values.learningPoints),
    fieldName: emptyToNull(values.fieldName),
    metadataDifficulty: emptyToNull(values.metadataDifficulty),
    estimatedReadMin: positiveIntegerToNull(values.estimatedReadMin),
    referenceDate: emptyToNull(values.referenceDate),
    tags: values.tags.map((tag) => tag.trim().replace(/\s+/g, ' ')).filter(Boolean),
    sources: values.sources
      .filter((source) => Object.values(source).some((value) => value.trim()))
      .map((source) => ({
        sourceName: source.sourceName.trim(),
        sourceTitle: source.sourceTitle.trim(),
        sourceUrl: source.sourceUrl.trim(),
        sourcePublishedAt: publicationTimestamp(source.sourcePublishedAt, sourceTimeZone(source.sourceUrl)) ?? '',
        checkedPoint: source.checkedPoint.trim(),
      })),
  }
}
