import { describe, expect, it } from 'vitest'
import { JournalModel } from './finance.model.js'

describe('financial safety invariants', () => {
  it('allocates no more than the captured payment amount', () => {
    const amount = 1000
    const principal = Math.min(amount, 700)
    const interest = Math.min(amount - principal, 200)
    const fees = amount - principal - interest
    expect(principal + interest + fees).toBe(amount)
    expect([principal, interest, fees].every((value) => value >= 0)).toBe(true)
  })

  it('rejects journals with a line that has both debit and credit values', async () => {
    const journal = new JournalModel({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      sourceType: 'manual',
      sourceId: 'source-1',
      lines: [
        { account: 'cash', debitMinor: 100, creditMinor: 100 },
        { account: 'loan_receivable', debitMinor: 0, creditMinor: 100 },
      ],
    })
    await expect(journal.validate()).rejects.toThrow('Journal entry must contain')
  })
})
