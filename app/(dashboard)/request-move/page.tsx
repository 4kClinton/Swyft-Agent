"use client"

import React from "react"

import type { ReactElement } from "react"
import { useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  MapPin,
  Calendar,
  Clock,
  Truck,
  Home,
  User,
  Phone,
  Mail,
  MessageSquare,
  Users,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { InteractiveMap } from "@/components/interactive-map"

// Kenya-specific location suggestions with more accurate coordinates
const KENYA_LOCATIONS = [
  { name: "Nairobi CBD", coords: [-1.2921, 36.8219] },
  { name: "Westlands, Nairobi", coords: [-1.2676, 36.8108] },
  { name: "Karen, Nairobi", coords: [-1.3197, 36.7085] },
  { name: "Kilimani, Nairobi", coords: [-1.2921, 36.7872] },
  { name: "Lavington, Nairobi", coords: [-1.2833, 36.7667] },
  { name: "Kileleshwa, Nairobi", coords: [-1.2833, 36.7833] },
  { name: "Parklands, Nairobi", coords: [-1.25, 36.8167] },
  { name: "Eastleigh, Nairobi", coords: [-1.2833, 36.85] },
  { name: "South B, Nairobi", coords: [-1.3167, 36.8333] },
  { name: "South C, Nairobi", coords: [-1.3333, 36.8333] },
  { name: "Runda, Nairobi", coords: [-1.2167, 36.8] },
  { name: "Muthaiga, Nairobi", coords: [-1.25, 36.8333] },
  { name: "Spring Valley, Nairobi", coords: [-1.2667, 36.7833] },
  { name: "Hurlingham, Nairobi", coords: [-1.3, 36.7833] },
  { name: "Riverside, Nairobi", coords: [-1.2667, 36.8] },
  { name: "Upper Hill, Nairobi", coords: [-1.3, 36.8167] },
  { name: "Gigiri, Nairobi", coords: [-1.2333, 36.8] },
  { name: "Kasarani, Nairobi", coords: [-1.2167, 36.9] },
  { name: "Embakasi, Nairobi", coords: [-1.3167, 36.9] },
  { name: "Langata, Nairobi", coords: [-1.3667, 36.7333] },
]

export default function RequestMovePage(): ReactElement {
  const { user, loading } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)

  // Form state
  const [clientName, setClientName] = useState("")
  const [clientPhone, setClientPhone] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [serviceType, setServiceType] = useState("")
  const [pickupAddress, setPickupAddress] = useState("")
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [pickupSuggestions, setPickupSuggestions] = useState<typeof KENYA_LOCATIONS>([])
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false)
  const [dropoffLocation, setDropoffLocation] = useState("")
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null)
  const [dropoffSuggestions, setDropoffSuggestions] = useState<typeof KENYA_LOCATIONS>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [vehicleType, setVehicleType] = useState("")
  const [houseSize, setHouseSize] = useState("")
  const [numLoaders, setNumLoaders] = useState(1)
  const [additionalNotes, setAdditionalNotes] = useState("")
  const [distance, setDistance] = useState(0)

  // Move management state
  const [moves, setMoves] = useState<any[]>([])
  const [moveFilter, setMoveFilter] = useState<"upcoming" | "successful" | "cancelled">("upcoming")
  const [isLoadingMoves, setIsLoadingMoves] = useState(false)

  // Service type options
  const serviceOptions = [
    {
      value: "movers",
      label: "Full Moving Service",
      description: "Professional movers with packing & unpacking",
      icon: <Home className="h-6 w-6 md:h-8 md:w-8" />,
    },
    {
      value: "transport",
      label: "Transport Only",
      description: "Vehicle rental for self-moving",
      icon: <Truck className="h-6 w-6 md:h-8 md:w-8" />,
    },
  ]

  // House size options for movers
  const houseSizeOptions = [
    {
      value: "studio",
      label: "Studio",
      description: "Studio apartment, minimal furniture",
      icon: "🏠",
    },
    {
      value: "1bedroom",
      label: "1 Bedroom",
      description: "Small apartment, basic furniture",
      icon: "🏠",
    },
    {
      value: "2bedroom",
      label: "2 Bedroom",
      description: "Medium apartment, moderate furniture",
      icon: "🏡",
    },
    {
      value: "3bedroom",
      label: "3 Bedroom",
      description: "Large apartment/house, substantial furniture",
      icon: "🏡",
    },
    {
      value: "4bedroom",
      label: "4 Bedroom",
      description: "Large house, extensive furniture",
      icon: "🏘️",
    },
    {
      value: "5bedroom",
      label: "5+ Bedroom",
      description: "Very large house, maximum furniture",
      icon: "🏘️",
    },
  ]

  // Transport vehicle options
  const vehicleOptions = [
    {
      value: "pickup",
      label: "Pickup Truck",
      description: "Small furniture, appliances",
      icon: "🚚",
    },
    {
      value: "van",
      label: "Van",
      description: "Medium moves, boxes",
      icon: "🚐",
    },
    {
      value: "miniTruck",
      label: "Mini Truck",
      description: "Large furniture, multiple rooms",
      icon: "🚛",
    },
    {
      value: "lorry5Tonne",
      label: "5 Tonne Lorry",
      description: "Heavy items, commercial moves",
      icon: "🚚",
    },
    {
      value: "lorry10Tonne",
      label: "10 Tonne Lorry",
      description: "Large commercial moves",
      icon: "🚛",
    },
  ]

  // Vehicle pricing structure with tiered rates
  const vehiclePricing = useMemo(
    () => ({
      pickup: {
        tier1Rate: 532,
        tier2Rate: 174,
        tier3Rate: 134,
        baseFee: 400,
      },
      van: {
        tier1Rate: 570,
        tier2Rate: 190,
        tier3Rate: 160,
        baseFee: 400,
      },
      miniTruck: {
        tier1Rate: 620,
        tier2Rate: 210,
        tier3Rate: 170,
        baseFee: 450,
      },
      lorry5Tonne: {
        tier1Rate: 680,
        tier2Rate: 230,
        tier3Rate: 180,
        baseFee: 500,
      },
      lorry10Tonne: {
        tier1Rate: 850,
        tier2Rate: 270,
        tier3Rate: 210,
        baseFee: 600,
      },
    }),
    [],
  )

  // Moving service rates
  const movingRates = useMemo(
    () => ({
      studio: 8000,
      "1bedroom": 12000,
      "2bedroom": 18000,
      "3bedroom": 25000,
      "4bedroom": 35000,
      "5bedroom": 50000,
    }),
    [],
  )

  // Steps configuration - removed building step
  const steps = [
    {
      id: 1,
      title: "Client Info",
      question: "Who is requesting this move?",
      icon: <User className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Tell us about the client who needs moving services",
    },
    {
      id: 2,
      title: "Service Type",
      question: "What type of moving service do you need?",
      icon: <Truck className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Choose between full moving service or transport only",
    },
    {
      id: 3,
      title: "Pickup",
      question: "Where are you moving from?",
      icon: <MapPin className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Enter the pickup address or building name",
    },
    {
      id: 4,
      title: "Drop-off",
      question: "Where are you moving to?",
      icon: <MapPin className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Enter the destination address",
    },
    {
      id: 5,
      title: "Schedule",
      question: "When do you need this service?",
      icon: <Calendar className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Choose your preferred date and time",
    },
    {
      id: 6,
      title: "Details",
      question: serviceType === "movers" ? "What size is the property?" : "What vehicle do you need?",
      icon:
        serviceType === "movers" ? (
          <Home className="h-4 w-4 md:h-5 md:w-5" />
        ) : (
          <Truck className="h-4 w-4 md:h-5 md:w-5" />
        ),
      description:
        serviceType === "movers"
          ? "Select the house size for accurate pricing"
          : "Choose vehicle type and number of loaders",
    },
    {
      id: 7,
      title: "Review",
      question: "Review your moving request",
      icon: <CheckCircle className="h-4 w-4 md:h-5 md:w-5" />,
      description: "Confirm details and send to WhatsApp",
    },
  ]

  // Calculate distance between two coordinates
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371 // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Kenya-specific geocoding function
  const geocodeKenyaLocation = async (address: string): Promise<[number, number] | null> => {
    try {
      const exactMatch = KENYA_LOCATIONS.find((loc) => loc.name.toLowerCase().includes(address.toLowerCase().trim()))
      if (exactMatch) {
        return exactMatch.coords as [number, number]
      }

      const kenyaQuery = `${address}, Kenya`
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(kenyaQuery)}&countrycodes=ke&limit=5`

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Swyft Property Management App",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data && data.length > 0) {
        const kenyaResults = data.filter((result: any) => {
          const lat = Number.parseFloat(result.lat)
          const lon = Number.parseFloat(result.lon)
          return lat >= -5 && lat <= 5 && lon >= 33 && lon <= 42
        })

        if (kenyaResults.length > 0) {
          const coords: [number, number] = [
            Number.parseFloat(kenyaResults[0].lat),
            Number.parseFloat(kenyaResults[0].lon),
          ]
          return coords
        }
      }

      return null
    } catch (error) {
      console.error("Kenya geocoding error:", error)
      return null
    }
  }

  // Handle pickup address input with suggestions
  const handlePickupAddressChange = (value: string) => {
    setPickupAddress(value)

    if (value.length > 1) {
      const filtered = KENYA_LOCATIONS.filter((location) =>
        location.name.toLowerCase().includes(value.toLowerCase()),
      ).slice(0, 5)
      setPickupSuggestions(filtered)
      setShowPickupSuggestions(true)
    } else {
      setShowPickupSuggestions(false)
    }

    if (value.length > 3) {
      const timeoutId = setTimeout(() => {
        geocodeKenyaLocation(value).then((coords) => {
          if (coords) {
            setPickupCoords(coords)
          }
        })
      }, 1000)

      return () => clearTimeout(timeoutId)
    }
  }

  // Handle pickup suggestion selection
  const handlePickupSuggestionSelect = (suggestion: (typeof KENYA_LOCATIONS)[0]) => {
    setPickupAddress(suggestion.name)
    setPickupCoords(suggestion.coords as [number, number])
    setShowPickupSuggestions(false)
  }

  // Handle dropoff location input with suggestions
  const handleDropoffChange = (value: string) => {
    setDropoffLocation(value)

    if (value.length > 1) {
      const filtered = KENYA_LOCATIONS.filter((location) =>
        location.name.toLowerCase().includes(value.toLowerCase()),
      ).slice(0, 5)
      setDropoffSuggestions(filtered)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }

    if (value.length > 2) {
      const timeoutId = setTimeout(() => {
        geocodeKenyaLocation(value).then((coords) => {
          if (coords) {
            setDropoffCoords(coords)
          }
        })
      }, 1000)

      return () => clearTimeout(timeoutId)
    }
  }

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: (typeof KENYA_LOCATIONS)[0]) => {
    setDropoffLocation(suggestion.name)
    setDropoffCoords(suggestion.coords as [number, number])
    setShowSuggestions(false)
  }

  // Calculate distance when both coordinates are available
  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      const dist = calculateDistance(pickupCoords[0], pickupCoords[1], dropoffCoords[0], dropoffCoords[1])
      setDistance(dist)
    }
  }, [pickupCoords, dropoffCoords])

  // Fetch moves data
  useEffect(() => {
    const fetchMoves = async () => {
      if (!user?.companyId) return

      setIsLoadingMoves(true)
      try {
        // Mock data for now - replace with actual API call
        const mockMoves: any[] = []
        setMoves(mockMoves)
      } catch (error) {
        console.error("Failed to fetch moves:", error)
      } finally {
        setIsLoadingMoves(false)
      }
    }

    fetchMoves()
  }, [user])

  // Calculate transport cost using tiered pricing
  const calculateTransportCost = (vehicleType: string, distance: number, numLoaders: number) => {
    const pricing = vehiclePricing[vehicleType as keyof typeof vehiclePricing]
    if (!pricing) return 0

    const loaderFee = 600
    let cost = 0

    if (distance <= 5) {
      cost = distance * pricing.tier1Rate
    } else if (distance <= 15) {
      cost = 5 * pricing.tier1Rate + (distance - 5) * pricing.tier2Rate
    } else {
      cost = 5 * pricing.tier1Rate + 10 * pricing.tier2Rate + (distance - 15) * pricing.tier3Rate
    }

    cost += numLoaders * loaderFee
    cost += pricing.baseFee

    return cost
  }

  // Calculate moving service cost
  const calculateMovingCost = (houseSize: string, distance: number) => {
    const baseRate = movingRates[houseSize as keyof typeof movingRates]
    if (!baseRate) return 0

    if (distance < 5) {
      return baseRate
    } else if (distance < 10) {
      return baseRate * 1.2
    } else if (distance < 20) {
      return baseRate * 1.4
    } else {
      return baseRate * 1.6
    }
  }

  // Update move status
  const updateMoveStatus = async (moveId: number, newStatus: "successful" | "cancelled") => {
    try {
      // Update local state immediately
      setMoves((prevMoves) => prevMoves.map((move) => (move.id === moveId ? { ...move, status: newStatus } : move)))

      // Here you would make an API call to update the status
      // await fetch(`/api/moves/${moveId}`, {
      //   method: 'PATCH',
      //   body: JSON.stringify({ status: newStatus })
      // })

      console.log(`Move ${moveId} status updated to ${newStatus}`)
    } catch (error) {
      console.error("Failed to update move status:", error)
    }
  }

  // Calculate estimated cost
  const estimatedCost = useMemo(() => {
    if (!serviceType || distance === 0) return { min: 0, max: 0 }

    let cost = 0

    if (serviceType === "movers" && houseSize) {
      cost = calculateMovingCost(houseSize, distance)
    } else if (serviceType === "transport" && vehicleType) {
      cost = calculateTransportCost(vehicleType, distance, numLoaders)
    }

    if (cost === 0) return { min: 0, max: 0 }

    return {
      min: Math.round(cost * 0.95),
      max: Math.round(cost * 1.05),
    }
  }, [serviceType, vehicleType, houseSize, distance, numLoaders, vehiclePricing])

  // Filter moves based on selected filter
  const filteredMoves = useMemo(() => {
    return moves.filter((move) => move.status === moveFilter)
  }, [moves, moveFilter])

  // Calculate company commission
  const companyCommission = useMemo(() => {
    const avgCost = (estimatedCost.min + estimatedCost.max) / 2
    return Math.round(avgCost * 0.04)
  }, [estimatedCost])

  // Prepare map locations
  const mapLocations = useMemo(() => {
    const locations = []
    if (pickupCoords) {
      locations.push({
        coords: pickupCoords,
        label: "Pickup",
        type: "pickup" as const,
      })
    }
    if (dropoffCoords) {
      locations.push({
        coords: dropoffCoords,
        label: "Drop-off",
        type: "dropoff" as const,
      })
    }
    return locations
  }, [pickupCoords, dropoffCoords])

  // Save move and send to WhatsApp
  const saveAndSendMove = () => {
    // Create new move object
    const newMove = {
      id: Date.now(), // Simple ID generation
      clientName,
      clientPhone,
      clientEmail,
      serviceType,
      pickupAddress,
      dropoffLocation,
      date,
      time,
      status: "upcoming" as const,
      estimatedCost: Math.round((estimatedCost.min + estimatedCost.max) / 2),
      createdAt: new Date().toISOString().split("T")[0],
      vehicleType: serviceType === "transport" ? vehicleType : undefined,
      houseSize: serviceType === "movers" ? houseSize : undefined,
      numLoaders: serviceType === "transport" ? numLoaders : undefined,
      additionalNotes,
      distance: Number(distance.toFixed(1)),
    }

    // Add to moves list
    setMoves((prevMoves) => [newMove, ...prevMoves])

    // Send to WhatsApp
    sendToWhatsApp()

    // Reset form after successful submission
    setTimeout(() => {
      setCurrentStep(1)
      setClientName("")
      setClientPhone("")
      setClientEmail("")
      setServiceType("")
      setPickupAddress("")
      setDropoffLocation("")
      setDate("")
      setTime("")
      setVehicleType("")
      setHouseSize("")
      setNumLoaders(1)
      setAdditionalNotes("")
      setDistance(0)
      setPickupCoords(null)
      setDropoffCoords(null)
    }, 1000)
  }

  // Send to WhatsApp function
  const sendToWhatsApp = () => {
    const selectedService =
      serviceType === "movers"
        ? houseSizeOptions.find((h) => h.value === houseSize)?.label
        : vehicleOptions.find((v) => v.value === vehicleType)?.label

    const message = `🚚 *SWYFT MOVING REQUEST*

📋 *SERVICE DETAILS:*
• Service Type: ${serviceType === "movers" ? "Full Moving Service" : "Transport Only"}
• ${serviceType === "movers" ? "House Size" : "Vehicle"}: ${selectedService}
• Distance: ${distance.toFixed(1)} km
${serviceType === "transport" ? `• Number of Loaders: ${numLoaders}` : ""}

📍 *LOCATIONS:*
• Pickup Address: ${pickupAddress}
• Drop-off: ${dropoffLocation}

📅 *SCHEDULE:*
• Date: ${date}
• Time: ${time}

👤 *CLIENT INFORMATION:*
• Name: ${clientName}
• Phone: ${clientPhone}
• Email: ${clientEmail}

💰 *FINAL PRICING:*
• Estimated Cost: KSh ${estimatedCost.min.toLocaleString()} - KSh ${estimatedCost.max.toLocaleString()}
${serviceType === "transport" ? `• Loaders Cost: KSh ${(numLoaders * 600).toLocaleString()} (${numLoaders} loader${numLoaders > 1 ? "s" : ""})` : ""}
• Company Commission (4%): KSh ${companyCommission.toLocaleString()}

📝 *ADDITIONAL NOTES:*
${additionalNotes || "None"}

🏢 *COMPANY:* ${user?.companyName || "N/A"}
📧 *Requested by:* ${user?.email || "N/A"}

---
*Generated via Swyft Property Management System*`

    const encodedMessage = encodeURIComponent(message)
    const whatsappUrl = `https://wa.me/254796652112?text=${encodedMessage}`
    window.open(whatsappUrl, "_blank")
  }

  // Validation functions
  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return clientName && clientPhone
      case 2:
        return serviceType
      case 3:
        return pickupAddress
      case 4:
        return dropoffLocation
      case 5:
        return date && time
      case 6:
        return serviceType === "movers" ? houseSize : vehicleType
      default:
        return true
    }
  }

  const canProceed = isStepValid(currentStep)
  const progress = (currentStep / steps.length) * 100

  // Navigation functions
  const nextStep = () => {
    if (canProceed && currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ marginTop: "5vh" }}>Request Move</h1>
        <p className="text-muted-foreground text-sm md:text-base">Let's help your client with their moving needs</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs md:text-sm text-muted-foreground">
          <span>
            Step {currentStep} of {steps.length}
          </span>
          <span>{Math.round(progress)}% Complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Indicators - Mobile Optimized */}
      <div className="flex flex-wrap justify-center gap-1 md:gap-2 mb-6 md:mb-8">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-2 rounded-full text-xs md:text-sm ${
              step.id === currentStep
                ? "bg-primary text-primary-foreground"
                : step.id < currentStep
                  ? "bg-green-100 text-green-800"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step.icon}
            <span className="hidden sm:inline">{step.title}</span>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <Card className="border-none shadow-lg">
        <CardContent className="p-4 md:p-8">
          {/* Step Content */}
          <div className="space-y-4 md:space-y-6">
            {/* Step Header */}
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <div className="p-3 md:p-4 rounded-full bg-primary/10">
                  {React.cloneElement(steps[currentStep - 1].icon, { className: "h-6 w-6 md:h-8 md:w-8 text-primary" })}
                </div>
              </div>
              <h2 className="text-xl md:text-2xl font-bold">{steps[currentStep - 1].question}</h2>
              <p className="text-muted-foreground text-sm md:text-base">{steps[currentStep - 1].description}</p>
            </div>

            {/* Step 1: Client Information */}
            {currentStep === 1 && (
              <div className="space-y-4 md:space-y-6 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Full Name *</Label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="clientName"
                        placeholder="Enter client's full name"
                        className="pl-8 mobile-input"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientPhone">Phone Number *</Label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="clientPhone"
                        placeholder="e.g., 0712345678"
                        className="pl-8 mobile-input"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        type="tel"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email Address (Optional)</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="clientEmail"
                      type="email"
                      placeholder="client@example.com"
                      className="pl-8 mobile-input"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Service Type */}
            {currentStep === 2 && (
              <div className="space-y-4 md:space-y-6 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {serviceOptions.map((option) => (
                    <Card
                      key={option.value}
                      className={`cursor-pointer transition-all hover:shadow-md mobile-button ${
                        serviceType === option.value ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setServiceType(option.value)}
                    >
                      <CardContent className="p-4 md:p-6 text-center">
                        <div className="flex justify-center mb-3 md:mb-4 text-primary">{option.icon}</div>
                        <h3 className="font-semibold text-base md:text-lg mb-2">{option.label}</h3>
                        <p className="text-xs md:text-sm text-muted-foreground">{option.description}</p>
                        {serviceType === option.value && <Badge className="mt-3">Selected</Badge>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Pickup Location - Simplified without building requirement */}
            {currentStep === 3 && (
              <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="pickupAddress">Pickup Address or Building Name *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="pickupAddress"
                          placeholder="Enter pickup address or building name (e.g., Karen Shopping Centre, Nairobi)"
                          className="pl-8 mobile-input"
                          value={pickupAddress}
                          onChange={(e) => handlePickupAddressChange(e.target.value)}
                          onFocus={() => pickupSuggestions.length > 0 && setShowPickupSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowPickupSuggestions(false), 200)}
                        />
                        {showPickupSuggestions && pickupSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                            {pickupSuggestions.map((suggestion, index) => (
                              <div
                                key={index}
                                className="px-3 py-2 hover:bg-muted cursor-pointer text-sm mobile-button"
                                onClick={() => handlePickupSuggestionSelect(suggestion)}
                              >
                                <div className="font-medium">{suggestion.name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {pickupCoords && (
                        <div className="text-xs text-muted-foreground">
                          📍 Location confirmed: {pickupCoords[0].toFixed(4)}, {pickupCoords[1].toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Interactive Map */}
                  <InteractiveMap locations={mapLocations} className="h-60 md:h-80" showRoute={false} />
                </div>

                {distance > 0 && (
                  <div className="text-center p-3 md:p-4 bg-primary/10 rounded-lg">
                    <p className="text-base md:text-lg font-semibold">📏 Distance: {distance.toFixed(1)} km</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Drop-off Location */}
            {currentStep === 4 && (
              <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="dropoff">Drop-off Location *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="dropoff"
                          placeholder="Enter destination address (e.g., Kilimani, Nairobi)"
                          className="pl-8 mobile-input"
                          value={dropoffLocation}
                          onChange={(e) => handleDropoffChange(e.target.value)}
                          onFocus={() => dropoffSuggestions.length > 0 && setShowSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        />
                        {showSuggestions && dropoffSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                            {dropoffSuggestions.map((suggestion, index) => (
                              <div
                                key={index}
                                className="px-3 py-2 hover:bg-muted cursor-pointer text-sm mobile-button"
                                onClick={() => handleSuggestionSelect(suggestion)}
                              >
                                <div className="font-medium">{suggestion.name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {dropoffCoords && (
                        <div className="text-xs text-muted-foreground">
                          📍 Location confirmed: {dropoffCoords[0].toFixed(4)}, {dropoffCoords[1].toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Interactive Map with Route */}
                  <InteractiveMap locations={mapLocations} className="h-60 md:h-80" showRoute={true} />
                </div>

                {distance > 0 && (
                  <div className="text-center p-3 md:p-4 bg-primary/10 rounded-lg">
                    <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-xs md:text-sm">Pickup: {pickupAddress}</span>
                      </div>
                      <div className="text-base md:text-lg font-semibold">📏 {distance.toFixed(1)} km</div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-xs md:text-sm">Drop-off: {dropoffLocation}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Schedule */}
            {currentStep === 5 && (
              <div className="space-y-4 md:space-y-6 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Preferred Date *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="date"
                        type="date"
                        className="pl-8 mobile-input"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time">Preferred Time *</Label>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="time"
                        type="time"
                        className="pl-8 mobile-input"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Service Details */}
            {currentStep === 6 && (
              <div className="space-y-4 md:space-y-6 max-w-2xl mx-auto">
                {serviceType === "movers" ? (
                  <div className="space-y-4">
                    <h3 className="text-base md:text-lg font-semibold text-center">Select House Size</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {houseSizeOptions.map((option) => (
                        <Card
                          key={option.value}
                          className={`cursor-pointer transition-all hover:shadow-md mobile-button ${
                            houseSize === option.value ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                          }`}
                          onClick={() => setHouseSize(option.value)}
                        >
                          <CardContent className="p-3 md:p-4">
                            <div className="flex items-center gap-3">
                              <span className="text-xl md:text-2xl">{option.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm md:text-base">{option.label}</div>
                                <div className="text-xs md:text-sm text-muted-foreground">{option.description}</div>
                              </div>
                              {houseSize === option.value && <Badge className="ml-auto">Selected</Badge>}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 md:space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-base md:text-lg font-semibold text-center">Select Vehicle Type</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {vehicleOptions.map((option) => (
                          <Card
                            key={option.value}
                            className={`cursor-pointer transition-all hover:shadow-md mobile-button ${
                              vehicleType === option.value ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                            }`}
                            onClick={() => setVehicleType(option.value)}
                          >
                            <CardContent className="p-3 md:p-4">
                              <div className="flex items-center gap-3">
                                <span className="text-xl md:text-2xl">{option.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm md:text-base">{option.label}</div>
                                  <div className="text-xs md:text-sm text-muted-foreground">{option.description}</div>
                                </div>
                                {vehicleType === option.value && <Badge className="ml-auto">Selected</Badge>}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="numLoaders">Number of Loaders *</Label>
                      <div className="relative">
                        <Users className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Select
                          value={numLoaders.toString()}
                          onValueChange={(value) => setNumLoaders(Number.parseInt(value))}
                        >
                          <SelectTrigger className="pl-8 mobile-input">
                            <SelectValue placeholder="Select number of loaders" />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6].map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                <div className="flex items-center gap-2">
                                  <span>
                                    {num} Loader{num > 1 ? "s" : ""}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    (+KSh {(num * 600).toLocaleString()})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="additionalNotes">Additional Notes (Optional)</Label>
                  <div className="relative">
                    <MessageSquare className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Textarea
                      id="additionalNotes"
                      placeholder="Any special instructions, items to move, or additional requirements..."
                      className="pl-8 min-h-[80px] mobile-input"
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Review & Send */}
            {currentStep === 7 && (
              <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Request Summary */}
                  <Card>
                    <CardContent className="p-4 md:p-6">
                      <h3 className="font-semibold mb-4">Request Summary</h3>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="font-medium">Client:</span> {clientName}
                        </div>
                        <div>
                          <span className="font-medium">Phone:</span> {clientPhone}
                        </div>
                        {clientEmail && (
                          <div>
                            <span className="font-medium">Email:</span> {clientEmail}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Service:</span>{" "}
                          {serviceType === "movers" ? "Full Moving Service" : "Transport Only"}
                        </div>
                        <div>
                          <span className="font-medium">{serviceType === "movers" ? "House Size:" : "Vehicle:"}</span>{" "}
                          {serviceType === "movers"
                            ? houseSizeOptions.find((h) => h.value === houseSize)?.label
                            : vehicleOptions.find((v) => v.value === vehicleType)?.label}
                        </div>
                        {serviceType === "transport" && (
                          <div>
                            <span className="font-medium">Loaders:</span> {numLoaders}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Date:</span> {date}
                        </div>
                        <div>
                          <span className="font-medium">Time:</span> {time}
                        </div>
                        <div>
                          <span className="font-medium">Distance:</span> {distance.toFixed(1)} km
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pricing Summary */}
                  <Card>
                    <CardContent className="p-4 md:p-6">
                      <h3 className="font-semibold mb-4">Pricing Estimate</h3>
                      {estimatedCost.min > 0 ? (
                        <div className="space-y-3">
                          <div className="text-xl md:text-2xl font-bold text-primary">
                            KSh {estimatedCost.min.toLocaleString()} - KSh {estimatedCost.max.toLocaleString()}
                          </div>
                          <div className="text-xs md:text-sm text-muted-foreground">
                            {serviceType === "movers"
                              ? "Includes professional movers, packing materials, and labor"
                              : "Vehicle rental with loaders - self-service moving"}
                          </div>
                          {serviceType === "transport" && (
                            <div className="text-sm">
                              <span className="font-medium">Loaders Cost:</span> KSh{" "}
                              {(numLoaders * 600).toLocaleString()}
                            </div>
                          )}
                          <div className="pt-3 border-t">
                            <div className="text-sm">
                              <span className="font-medium"> Commission (4%):</span> KSh{" "}
                              {companyCommission.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">Complete all steps for pricing estimate</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Locations */}
                <Card>
                  <CardContent className="p-4 md:p-6">
                    <h3 className="font-semibold mb-4">Locations</h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                        <div className="min-w-0">
                          <span className="font-medium">Pickup:</span>
                          <br />
                          <span className="break-words">{pickupAddress}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-red-500 mt-2 flex-shrink-0"></div>
                        <div className="min-w-0">
                          <span className="font-medium">Drop-off:</span>
                          <br />
                          <span className="break-words">{dropoffLocation}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Additional Notes */}
                {additionalNotes && (
                  <Card>
                    <CardContent className="p-4 md:p-6">
                      <h3 className="font-semibold mb-4">Additional Notes</h3>
                      <p className="text-sm text-muted-foreground break-words">{additionalNotes}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Final Map Preview */}
                {mapLocations.length > 0 && (
                  <Card>
                    <CardContent className="p-4 md:p-6">
                      <h3 className="font-semibold mb-4">Route Overview</h3>
                      <InteractiveMap locations={mapLocations} className="h-48 md:h-64" showRoute={true} />
                    </CardContent>
                  </Card>
                )}

                {/* Send Button */}
                <div className="text-center">
                  <Button
                    onClick={saveAndSendMove}
                    size="lg"
                    className="w-full md:w-auto px-6 md:px-8 mobile-button"
                    disabled={!user}
                  >
                    Send Request to WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-6 md:mt-8 pt-4 md:pt-6 border-t">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 bg-transparent mobile-button"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="text-xs md:text-sm text-muted-foreground">
              Step {currentStep} of {steps.length}
            </div>

            {currentStep < steps.length ? (
              <Button onClick={nextStep} disabled={!canProceed} className="flex items-center gap-2 mobile-button">
                <span className="hidden sm:inline">Next</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={saveAndSendMove} disabled={!user} className="flex items-center gap-2 mobile-button">
                <span className="hidden sm:inline">Send Request</span>
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Move Management Section */}
      <Card className="border-none shadow-lg">
        <CardContent className="p-4 md:p-8">
          <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold">Move Management</h2>
                <p className="text-muted-foreground text-sm md:text-base">View upcoming move-ins & move-outs</p>
              </div>

              {/* Filter Switch */}
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                <Button
                  variant={moveFilter === "upcoming" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMoveFilter("upcoming")}
                  className="text-xs md:text-sm"
                >
                  Upcoming
                </Button>
                <Button
                  variant={moveFilter === "successful" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMoveFilter("successful")}
                  className="text-xs md:text-sm"
                >
                  Successful
                </Button>
                <Button
                  variant={moveFilter === "cancelled" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMoveFilter("cancelled")}
                  className="text-xs md:text-sm"
                >
                  Cancelled
                </Button>
              </div>
            </div>

            {/* Moves List */}
            {isLoadingMoves ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredMoves.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">No {moveFilter} moves found</div>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMoves.map((move) => (
                  <Card key={move.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{move.clientName}</h3>
                            <Badge
                              variant={
                                move.status === "upcoming"
                                  ? "default"
                                  : move.status === "successful"
                                    ? "secondary"
                                    : "destructive"
                              }
                              className={
                                move.status === "upcoming"
                                  ? "bg-blue-100 text-blue-800"
                                  : move.status === "successful"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                              }
                            >
                              {move.status.charAt(0).toUpperCase() + move.status.slice(1)}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div>📞 {move.clientPhone}</div>
                            <div>🚚 {move.serviceType === "movers" ? "Full Moving Service" : "Transport Only"}</div>
                            {move.serviceType === "movers" && move.houseSize && (
                              <div>🏠 {houseSizeOptions.find((h) => h.value === move.houseSize)?.label}</div>
                            )}
                            {move.serviceType === "transport" && move.vehicleType && (
                              <div>
                                🚛 {vehicleOptions.find((v) => v.value === move.vehicleType)?.label} ({move.numLoaders}{" "}
                                loader{move.numLoaders > 1 ? "s" : ""})
                              </div>
                            )}
                            <div>
                              📍 {move.pickupAddress} → {move.dropoffLocation}
                            </div>
                            <div>
                              📅 {move.date} at {move.time}
                            </div>
                            <div>💰 KSh {move.estimatedCost.toLocaleString()}</div>
                            {move.distance && <div>📏 {move.distance} km</div>}
                          </div>
                        </div>

                        {/* Action Buttons - Only show for upcoming moves */}
                        {move.status === "upcoming" && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateMoveStatus(move.id, "successful")}
                              className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateMoveStatus(move.id, "cancelled")}
                              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                            >
                              <ArrowLeft className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
