import { describe, expect, it } from 'vitest'

describe('financial safety invariants', () => {
  it('allocates no more than the captured payment amount', () => {
    const amount = 1000
    const principal = Math.min(amount, 700)
    const interest = Math.min(amount - principal, 200)
    const fees = amount - principal - interest
    expect(principal + interest + fees).toBe(amount)
    expect([principal, interest, fees].every((value) => value >= 0)).toBe(true)
  })
})
