export default function VacantUnitsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="h-8 w-48 bg-secondary rounded animate-pulse"></div>
          <div className="h-4 w-64 bg-secondary rounded animate-pulse mt-2"></div>
        </div>
        <div className="h-10 w-32 bg-secondary rounded animate-pulse"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-secondary rounded animate-pulse"></div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-96 bg-secondary rounded animate-pulse"></div>
        ))}
      </div>
    </div>
  )
}
