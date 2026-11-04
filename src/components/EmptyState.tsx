import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={28} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p></div>
}

export function PreviewBadge() {
  return <span className="preview-badge">화면 미리보기</span>
}
