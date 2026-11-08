function significantWords(text: unknown): string[] {
  return (
    String(text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .match(/\p{L}{3,}/gu) || []
  )
}

type Row = { id?: unknown; name?: unknown; companyName?: unknown; title?: unknown }

/**
 * OpenAI sees only the customers and jobs the user actually named: those sharing a
 * word of 3+ letters with the transcript, plus the ones currently open.
 */
export function minimizeVoiceContext<T extends Record<string, any>>(context: T, transcript: string): T {
  const spoken = new Set(significantWords(transcript))
  const mentioned = (...values: unknown[]) =>
    values.some((value) => significantWords(value).some((word) => spoken.has(word)))

  const customers: Row[] = Array.isArray(context.existingCustomers) ? context.existingCustomers : []
  const jobs: Row[] = Array.isArray(context.existingJobs) ? context.existingJobs : []
  const currentCustomerId = context.currentCustomer?.id
  const currentJobId = context.currentJob?.id

  return {
    ...context,
    existingCustomers: customers.filter(
      (row) => (currentCustomerId && row.id === currentCustomerId) || mentioned(row.name, row.companyName)
    ),
    existingJobs: jobs.filter(
      (row) => (currentJobId && row.id === currentJobId) || mentioned(row.title)
    ),
  }
}
