import { BACKUP_GENERATION_STEPS } from './backup.constants'

export function BackupGenerationProgress({ currentStep }: { currentStep: number }) {
  return (
    <section className="backup-panel" aria-labelledby="backup-progress-title">
      <h2 id="backup-progress-title">생성 진행 상태</h2>
      <ol className="backup-progress">
        {BACKUP_GENERATION_STEPS.map((step, index) => (
          <li key={step} className={index < currentStep ? 'is-complete' : index === currentStep ? 'is-current' : ''} aria-current={index === currentStep ? 'step' : undefined}>
            {step}
          </li>
        ))}
      </ol>
    </section>
  )
}
