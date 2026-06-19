"use client"

// Free location picker built on Leaflet + OpenStreetMap. No API key / billing.
// Search uses the public Nominatim geocoder. Loaded client-side only (Leaflet
// touches `window`), so import this via next/dynamic with `ssr: false`.

import { useEffect, useRef, useState } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Search, MapPin } from "lucide-react"

// Leaflet's default marker images don't resolve through bundlers — point them
// at the CDN-hosted assets so the pin renders.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Nairobi CBD — sensible default centre for a Kenyan property tool.
const DEFAULT_CENTER: [number, number] = [-1.286389, 36.817223]

type LatLng = { lat: number; lng: number }

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

// Imperatively recenters the map when a search result is chosen.
function Recenter({ position }: { position: LatLng | null }) {
  const map = useMap()
  const last = useRef<string>("")
  useEffect(() => {
    if (!position) return
    const key = `${position.lat},${position.lng}`
    if (key === last.current) return
    last.current = key
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15))
  }, [position, map])
  return null
}

type SearchResult = { display_name: string; lat: string; lon: string }

export interface LocationPickerProps {
  value: LatLng | null
  onChange: (value: LatLng) => void
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults([])
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ke&q=" +
        encodeURIComponent(q)
      const res = await fetch(url, { headers: { "Accept-Language": "en" } })
      const data = (await res.json()) as SearchResult[]
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const pickResult = (r: SearchResult) => {
    const p = { lat: Number(r.lat), lng: Number(r.lon) }
    onChange(p)
    setResults([])
    setQuery(r.display_name.split(",").slice(0, 2).join(", "))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                search()
              }
            }}
            placeholder="Search an estate, road or landmark…"
            className="pl-8"
          />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickResult(r)}
              className="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="h-64 w-full overflow-hidden rounded-md border">
        <MapContainer
          center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
          zoom={value ? 15 : 12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          <Recenter position={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const m = e.target as L.Marker
                  const p = m.getLatLng()
                  onChange({ lat: p.lat, lng: p.lng })
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        {value
          ? `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — drag the pin or click the map to adjust.`
          : "Search above, or click the map to drop a pin."}
      </p>
    </div>
  )
}
