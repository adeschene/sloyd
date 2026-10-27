/**
 * Box joints' even-N parity (spec, Amended 2026-10-27): does segment `N` (J's max) carry a finger, given segment 1's kind.
 * The same kind when `N` is odd, the other when it is even. A leaf module (imports nothing) so that both `boxJoints.ts`
 * and `boxJointText.ts` read the ONE rule without an import cycle between them.
 */
export const fingerAtMaxOf = (count: number, fingerAtMin: boolean): boolean => (count % 2 === 1 ? fingerAtMin : !fingerAtMin);
