export type Vote = -1 | 1 | null
export interface Engagement { vote: Vote; likes: number; dislikes: number; comment_count: number }
export interface EngagementState { data: Engagement; optimistic?: Engagement }
export function voteResult(previous: Vote, clicked: -1 | 1): Vote { return previous === clicked ? null : clicked }
export function applyVote(state: Engagement, next: Vote): Engagement {
  return { ...state, vote: next, likes: Math.max(0, state.likes - Number(state.vote === 1) + Number(next === 1)), dislikes: Math.max(0, state.dislikes - Number(state.vote === -1) + Number(next === -1)) }
}
export function validateComment(value: string) {
  const text = value.trim()
  if (!text || Array.from(text).length > 300) throw new Error('댓글은 공백을 제외한 내용이 있는 1~300자로 입력해주세요.')
  return text
}
