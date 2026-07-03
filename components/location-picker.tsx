"use client"

// Google Maps location picker. Uses the Maps JavaScript API + Places Autocomplete
// + Geocoder via @vis.gl/react-google-maps. Reads NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// (enable "Maps JavaScript API" and "Places API" for the key). Loaded client-side
// only, so import via next/dynamic with `ssr: false`.

import { useEffect, useRef, useState } from "react"
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps"
import { Input } from "@/components/ui/input"
import { Loader2, Search, MapPin } from "lucide-react"

// Nairobi CBD — fallback centre when we have neither a value nor device GPS.
const DEFAULT_CENTER = { lat: -1.286389, lng: 36.817223 }
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

type LatLng = { lat: number; lng: number }

// A picked point, enriched with a human-readable address derived from the pin
// via reverse geocoding — so the building form doesn't need manual address fields.
export type PickedLocation = {
  lat: number
  lng: number
  address?: string
  city?: string
  county?: string
}

export interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (value: PickedLocation) => void
}

// Pull city/county/street out of a Geocoder result's address components.
function parseComponents(
  components: google.maps.GeocoderAddressComponent[],
): Pick<PickedLocation, "address" | "city" | "county"> {
  const get = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name
  const route = get("route")
  const neighbourhood = get("neighborhood") ?? get("sublocality")
  const address = [route, neighbourhood].filter(Boolean).join(", ") || undefined
  const city =
    get("locality") ??
    get("administrative_area_level_2") ??
    get("administrative_area_level_1")
  const county =
    get("administrative_area_level_2") ?? get("administrative_area_level_1")
  return { address, city, county }
}

// Inner picker — must live under <APIProvider> so the Maps hooks work.
function Picker({ value, onChange }: LocationPickerProps) {
  const map = useMap()
  const placesLib = useMapsLibrary("places")
  const geocodingLib = useMapsLibrary("geocoding")
  const inputRef = useRef<HTMLInputElement>(null)
  const [resolving, setResolving] = useState(false)
  const geocoder = useRef<google.maps.Geocoder | null>(null)

  useEffect(() => {
    if (geocodingLib && !geocoder.current) geocoder.current = new geocodingLib.Geocoder()
  }, [geocodingLib])

  // Reverse geocode a pin to address parts (best-effort).
  const reverseGeocode = async (p: LatLng): Promise<Partial<PickedLocation>> => {
    if (!geocoder.current) return {}
    try {
      const { results } = await geocoder.current.geocode({ location: p })
      const best = results[0]
      return best ? parseComponents(best.address_components) : {}
    } catch {
      return {}
    }
  }

  // Set the pin immediately, then enrich it with a resolved address.
  const pick = async (p: LatLng) => {
    onChange(p)
    map?.panTo(p)
    setResolving(true)
    try {
      const a = await reverseGeocode(p)
      onChange({ ...p, ...a })
    } finally {
      setResolving(false)
    }
  }

  // Centre on the device's real location on first mount when nothing is picked
  // yet — avoids everyone defaulting to Nairobi CBD.
  useEffect(() => {
    if (value || !map || typeof navigator === "undefined" || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    )
    // Only on first mount / map ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // Bind Places Autocomplete to the search input.
  useEffect(() => {
    if (!placesLib || !inputRef.current) return
    const ac = new placesLib.Autocomplete(inputRef.current, {
      fields: ["geometry", "formatted_address"],
      componentRestrictions: { country: "ke" },
    })
    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace()
      const loc = place.geometry?.location
      if (!loc) return
      void pick({ lat: loc.lat(), lng: loc.lng() })
    })
    return () => listener.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search an estate, road or landmark…"
          className="pl-8"
          onKeyDown={(e) => {
            // Let Autocomplete handle Enter; don't submit the building form.
            if (e.key === "Enter") e.preventDefault()
          }}
        />
      </div>

      <div className="h-64 w-full overflow-hidden rounded-md border">
        <Map
          defaultCenter={value ?? DEFAULT_CENTER}
          defaultZoom={value ? 16 : 12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          onClick={(e) => {
            if (e.detail.latLng) void pick(e.detail.latLng)
          }}
        >
          {value && (
            <Marker
              position={value}
              draggable
              onDragEnd={(e) => {
                if (e.latLng) void pick({ lat: e.latLng.lat(), lng: e.latLng.lng() })
              }}
            />
          )}
        </Map>
      </div>

      <p className="text-xs text-muted-foreground">
        {resolving ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Looking up the address…
          </span>
        ) : value ? (
          value.address
            ? `${value.address}${value.city ? `, ${value.city}` : ""} — drag the pin or click the map to adjust.`
            : `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — drag the pin or click the map to adjust.`
        ) : (
          "Search above, or click the map to drop a pin."
        )}
      </p>
    </div>
  )
}

export default function LocationPicker(props: LocationPickerProps) {
  if (!API_KEY) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-md border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable location.
        </span>
      </div>
    )
  }
  return (
    <APIProvider apiKey={API_KEY}>
      <Picker {...props} />
    </APIProvider>
  )
}
