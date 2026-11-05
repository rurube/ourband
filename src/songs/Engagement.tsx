import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useRef } from 'react'
import { engagementKeys, toggleVote } from './engagement-api'
import { applyVote, voteResult, type EngagementState } from './engagement-model'

export function refreshSongLists(client: QueryClient, band: string) {
  return client.invalidateQueries({ predicate: q => q.queryKey[0] === 'songs' && q.queryKey[1] === band && ['catalog', 'recent', 'popular', 'detail'].includes(String(q.queryKey[2])) })
}
export function refreshEngagement(client: QueryClient, band: string) {
  return client.invalidateQueries({ queryKey: ['songs', band, 'engagement-batch'] })
}
export function useVote(band: string, id: string) {
  const client = useQueryClient()
  const { session } = useAuth()
  const key = engagementKeys.state(band, id, session!.user.id)
  const state = useQuery<EngagementState>({ queryKey: key, enabled: false })
  const pending = useIsMutating({ mutationKey: ['song-vote', band, id] }) > 0
  const running = useRef(false)
  const mutation = useMutation({
    mutationKey: ['song-vote', band, id], retry: false,
    mutationFn: (clicked: -1 | 1) => toggleVote(band, id, clicked),
    onMutate: clicked => {
      const previous = client.getQueryData<EngagementState>(key)
      if (previous) client.setQueryData<EngagementState>(key, { data: previous.data, optimistic: applyVote(previous.data, voteResult(previous.data.vote, clicked)) })
      return previous
    },
    onSuccess: (actual, _clicked, previous) => {
      // The DB result can differ from the expected toggle after another device votes.
      if (previous) client.setQueryData<EngagementState>(key, () => ({ data: applyVote(previous.data, actual), optimistic: applyVote(previous.data, actual) }))
    },
    onError: (_error, _clicked, previous) => { if (previous) client.setQueryData(key, { data: previous.data }) },
    onSettled: async () => {
      try { await Promise.all([refreshEngagement(client, band), refreshSongLists(client, band)]) }
      finally {
        // Batch reads refresh the base while preserving other in-flight overlays.
        client.setQueryData<EngagementState>(key, old => old ? { data: old.data } : old)
      }
    },
  })
  async function vote(clicked: -1 | 1) {
    if (running.current || pending || !state.data) return
    running.current = true
    try { await mutation.mutateAsync(clicked) } catch { /* displayed by the card */ }
    finally { running.current = false }
  }
  return { engagement: state.data?.optimistic ?? state.data?.data, pending, vote, error: mutation.error?.message }
}
