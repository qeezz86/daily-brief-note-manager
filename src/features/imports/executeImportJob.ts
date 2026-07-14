import type { DatabaseClient } from '../../shared/supabase/client'
import { runImportItemContent, runImportItemTracking } from './importJobs.repository'
import type { ImportJobExecutionMode, ImportJobItem } from './importJobs.types'

export interface ImportJobExecutionProgress {
  completed: number
  total: number
  currentTitle: string | null
}

function targets(items: ImportJobItem[], mode: ImportJobExecutionMode) {
  return [...items].sort((a, b) => a.itemIndex - b.itemIndex).filter((item) => {
    if (mode === 'pending') return item.contentStatus === 'pending' || (item.contentStatus === 'imported' && item.trackingStatus === 'pending')
    if (mode === 'content_failed') return item.contentStatus === 'failed' && item.contentRetryable
    if (mode === 'tracking_failed') return item.trackingStatus === 'failed' && item.trackingRetryable
    return (item.contentStatus === 'failed' && item.contentRetryable) || (item.trackingStatus === 'failed' && item.trackingRetryable)
  })
}

export async function executeImportJob(client: DatabaseClient, items: ImportJobItem[], mode: ImportJobExecutionMode, options: {
  onProgress?: (progress: ImportJobExecutionProgress) => void
  shouldStop?: () => boolean
} = {}) {
  const selected = targets(items, mode)
  for (let index = 0; index < selected.length; index += 1) {
    if (options.shouldStop?.()) break
    const item = selected[index]
    options.onProgress?.({ completed: index, total: selected.length, currentTitle: item.title })
    if (mode === 'pending') {
      if (item.contentStatus === 'pending') {
        const content = await runImportItemContent(client, item.id)
        if (content.success && content.contentStatus === 'imported' && content.trackingStatus === 'pending') {
          await runImportItemTracking(client, item.id)
        }
      } else if (item.contentStatus === 'imported' && item.trackingStatus === 'pending') {
        await runImportItemTracking(client, item.id)
      }
    } else if ((mode === 'content_failed' || mode === 'all_failed') && item.contentStatus === 'failed' && item.contentRetryable) {
      await runImportItemContent(client, item.id)
    } else if ((mode === 'tracking_failed' || mode === 'all_failed') && item.trackingStatus === 'failed' && item.trackingRetryable) {
      await runImportItemTracking(client, item.id)
    }
  }
  options.onProgress?.({ completed: selected.length, total: selected.length, currentTitle: null })
  return { processed: selected.length }
}
