// Exponential backoff retry สำหรับ Google API calls
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('quota'))

      if (!isRateLimit || attempt === maxAttempts) throw error

      const delay = baseDelayMs * Math.pow(2, attempt - 1) // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
