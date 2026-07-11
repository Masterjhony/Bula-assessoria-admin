import LeiloesTabs from './LeiloesTabs'

export default function LeiloesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <LeiloesTabs />
      {children}
    </div>
  )
}
