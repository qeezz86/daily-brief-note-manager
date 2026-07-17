export class BundleBudgetError extends Error {
  constructor(message, code = 'BUNDLE_CONFIG_ERROR') {
    super(message)
    this.name = 'BundleBudgetError'
    this.code = code
    this.exitCode = 2
  }
}
