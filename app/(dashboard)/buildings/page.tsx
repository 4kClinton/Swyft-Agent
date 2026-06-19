"use client"

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Search, MapPin, BuildingIcon, Users, Trash2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function BuildingsPage() {
  const buildingsData = useQuery(api.buildings.list)
  const removeBuilding = useMutation(api.buildings.remove)
  const loading = buildingsData === undefined
  const buildings = buildingsData ?? []
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")

  const handleDelete = async (id: string) => {
    try {
      await removeBuilding({ id: id as any })
      toast.success("Building deleted")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete building")
    }
  }

  const filteredBuildings = buildings.filter((building) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      building.name.toLowerCase().includes(term) ||
      (building.address ?? "").toLowerCase().includes(term) ||
      (building.city ?? "").toLowerCase().includes(term)

    const matchesType = filterType === "all" || building.propertyType === filterType

    return matchesSearch && matchesType
  })

  if (loading) {
    return (
      <div className="w-full space-y-4 p-4 md:p-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Buildings</h1>
          <Button asChild>
            <Link href="/new-building">
              <Plus className="mr-2 h-4 w-4" />
              Add Building
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Buildings</h1>
          <p className="text-gray-600 mt-1">Manage your property buildings</p>
        </div>
        <Button asChild>
          <Link href="/new-building">
            <Plus className="mr-2 h-4 w-4" />
            Add Building
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by name, address, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="apartment">Apartment</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="mixed">Mixed Use</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Buildings Grid */}
      {filteredBuildings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <BuildingIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No buildings found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || filterType !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first building"}
              </p>
              <Button asChild>
                <Link href="/new-building">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Building
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBuildings.map((building) => (
            <Card key={building._id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-1">{building.name}</CardTitle>
                    <div className="flex items-center text-gray-600 text-sm mt-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      <span className="line-clamp-1">
                        {[building.address, building.city].filter(Boolean).join(", ") || "No address"}
                      </span>
                    </div>
                  </div>
                  {building.propertyType && (
                    <Badge className="bg-green-100 text-green-800 capitalize">
                      {building.propertyType}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-gray-600">
                    <BuildingIcon className="h-4 w-4 mr-1" />
                    <span className="capitalize">{building.propertyType ?? "property"}</span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Users className="h-4 w-4 mr-1" />
                    <span>{building.totalUnits ?? 0} units</span>
                  </div>
                </div>

                {building.description && <p className="text-sm text-gray-600 line-clamp-2">{building.description}</p>}

                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-gray-500">
                    Added {new Date(building._creationTime).toLocaleDateString()}
                  </p>

                  <Button variant="outline" size="sm" onClick={() => handleDelete(building._id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
