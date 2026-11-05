import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEngagement, engagementKeys } from './engagement-api'
import type { EngagementState } from './engagement-model'
import type { CatalogSong } from './model'
import { useAuth } from '../auth/AuthProvider'
import { SongCard } from './SongCard'

export function SongCollection({ bandId, songs, onEdit, onOpen, onStatus, detail = false }: { bandId: string; songs: CatalogSong[]; onEdit: (song: CatalogSong) => void; onOpen: (id: string) => void; onStatus?: (message: string) => void; detail?: boolean }) {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session!.user.id
  const ids = [...new Set(songs.map(song => song.id))].sort()
  const batch = useQuery({
    queryKey: engagementKeys.batch(bandId, ids, userId), enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const entries = await fetchEngagement(bandId, ids, signal)
      for (const [id, data] of Object.entries(entries)) client.setQueryData<EngagementState>(engagementKeys.state(bandId, id, userId), old => ({ data, ...(old?.optimistic ? { optimistic: old.optimistic } : {}) }))
      return entries
    },
  })
  return <>{batch.error && <p role="alert" className="form-message error-message">{batch.error.message}<button className="text-button" onClick={() => { void batch.refetch() }}>투표·댓글 수 다시 불러오기</button></p>}{songs.map(song => <SongCard key={song.id} bandId={bandId} song={song} onEdit={onEdit} onOpen={onOpen} onStatus={onStatus} detail={detail} />)}</>
}
