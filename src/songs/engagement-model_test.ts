import { applyVote, validateComment, voteResult, type Engagement } from './engagement-model.ts'
function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
const initial: Engagement = { vote: null, likes: 5, dislikes: 2, comment_count: 8 }
Deno.test('optimistic vote state supports selection, cancellation and reversal without mutating rollback snapshot', () => {
  const liked = applyVote(initial, voteResult(initial.vote, 1))
  assert(liked.likes === 6 && liked.vote === 1 && initial.likes === 5 && initial.vote === null, 'like and immutable rollback')
  const canceled = applyVote(liked, voteResult(liked.vote, 1))
  assert(canceled.likes === 5 && canceled.dislikes === 2 && canceled.vote === null, 'cancel')
  const disliked = applyVote(liked, voteResult(liked.vote, -1))
  assert(disliked.likes === 5 && disliked.dislikes === 3 && disliked.vote === -1 && disliked.comment_count === 8, 'reverse')
})
Deno.test('server-returned vote can correct an optimistic result after a different device votes', () => {
  const corrected = applyVote(initial, null)
  assert(corrected.likes === 5 && corrected.vote === null, 'authoritative cancellation')
  assert(applyVote({ ...initial, likes: 0, vote: 1 }, null).likes === 0, 'stale counts never negative')
})
Deno.test('comment validation counts Unicode code points and keeps meaningful newlines', () => {
  assert(validateComment(' 🎵'.trim().repeat(300)).length === 600, '300 astral code points')
  assert(validateComment('  안녕\n합주  ') === '안녕\n합주', 'trim only outer whitespace')
  for (const bad of ['', ' \n\t ', '가'.repeat(301), '🎵'.repeat(301)]) {
    let rejected = false; try { validateComment(bad) } catch { rejected = true }
    assert(rejected, 'invalid comment must fail before network')
  }
})
