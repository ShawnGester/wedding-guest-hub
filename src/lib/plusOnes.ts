/** Extra guests on one invitation. Non-empty names are the people who count. */

export function splitPlusOneList(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((name) => name.trim())
    .filter(Boolean)
}

export function plusOneNames(guest: {
  plusOnes?: string[]
  plusOneName?: string
}): string[] {
  const fromList = Array.isArray(guest.plusOnes)
    ? guest.plusOnes.map((name) => name.trim()).filter(Boolean)
    : []
  if (fromList.length) return fromList
  const legacy = (guest.plusOneName ?? '').trim()
  return legacy ? splitPlusOneList(legacy) : []
}

/** Invitation row plus every named plus-one. */
export function seatedCount(guest: { plusOnes?: string[]; plusOneName?: string }): number {
  return 1 + plusOneNames(guest).length
}

export function withPlusOnes<
  T extends {
    plusOne: boolean
    plusOneName?: string
    plusOnes?: string[]
    partySize: number
  },
>(guest: T, names: string[]): T {
  const plusOnes = names.map((name) => name.trim()).filter(Boolean)
  return {
    ...guest,
    plusOnes,
    plusOne: plusOnes.length > 0,
    plusOneName: plusOnes.join(', '),
    partySize: Math.max(guest.partySize || 1, 1 + plusOnes.length),
  }
}
