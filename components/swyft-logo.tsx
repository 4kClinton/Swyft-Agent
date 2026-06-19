import Image from "next/image"

/**
 * Swyft wordmark logo (green pill + paper-plane mark). Source lives in
 * /public/swyft-logo.png (trimmed to 960×310). Control size with a Tailwind
 * height class, e.g. <SwyftLogo className="h-7 w-auto" />.
 */
export function SwyftLogo({
  className = "h-7 w-auto",
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/swyft-logo.png"
      alt="Swyft"
      width={960}
      height={310}
      priority={priority}
      className={className}
    />
  )
}
