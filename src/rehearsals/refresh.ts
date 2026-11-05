import type { QueryClient } from '@tanstack/react-query'
export function refreshRehearsals(client: QueryClient, band: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['rehearsals', band] }),
    client.invalidateQueries({ queryKey: ['home-rehearsals', band] }),
    client.invalidateQueries({ queryKey: ['songs', band] }),
  ])
}
