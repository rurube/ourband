import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  // HashRouter로 GitHub Pages에서 하위 경로 및 새로고침을 지원합니다.
  return <QueryClientProvider client={queryClient}><HashRouter>{children}</HashRouter></QueryClientProvider>
}
