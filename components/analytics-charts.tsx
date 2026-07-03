"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts"

// Sample data
const tenantActivityData = [
  { month: "Jan", newTenants: 15, moveOuts: 8, renewals: 45 },
  { month: "Feb", newTenants: 22, moveOuts: 12, renewals: 38 },
  { month: "Mar", newTenants: 18, moveOuts: 10, renewals: 52 },
  { month: "Apr", newTenants: 25, moveOuts: 6, renewals: 48 },
  { month: "May", newTenants: 20, moveOuts: 15, renewals: 42 },
  { month: "Jun", newTenants: 28, moveOuts: 9, renewals: 55 },
]

const propertyTypeData = [
  { name: "Apartments", value: 94, units: 1247, color: "#3B82F6" },
  { name: "Houses", value: 47, units: 623, color: "#10B981" },
  { name: "Commercial", value: 15, units: 89, color: "#F59E0B" },
  { name: "Condos", value: 23, units: 312, color: "#8B5CF6" },
]

const occupancyTrendData = [
  { month: "Jan", occupancy: 92.5, vacantUnits: 45 },
  { month: "Feb", occupancy: 94.2, vacantUnits: 38 },
  { month: "Mar", occupancy: 91.8, vacantUnits: 52 },
  { month: "Apr", occupancy: 95.1, vacantUnits: 32 },
  { month: "May", occupancy: 93.7, vacantUnits: 41 },
  { month: "Jun", occupancy: 96.3, vacantUnits: 24 },
]

const maintenanceByTypeData = [
  { type: "Plumbing", requests: 45, avgTime: 2.5 },
  { type: "Electrical", requests: 32, avgTime: 3.2 },
  { type: "HVAC", requests: 28, avgTime: 4.1 },
  { type: "Appliances", requests: 38, avgTime: 1.8 },
  { type: "General", requests: 52, avgTime: 1.2 },
]

interface AnalyticsChartsProps {
  type: "overview" | "tenants" | "properties" | "maintenance"
}

export function AnalyticsCharts({ type }: AnalyticsChartsProps) {
  // Overview shows a simplified dashboard with fewer charts
  if (type === "overview") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Tenant Activity Trends</CardTitle>
            <CardDescription>Monthly tenant movements and renewals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tenantActivityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Legend />
                  <Line type="monotone" dataKey="newTenants" stroke="#10B981" strokeWidth={2} name="New Tenants" />
                  <Line type="monotone" dataKey="moveOuts" stroke="#EF4444" strokeWidth={2} name="Move Outs" />
                  <Line type="monotone" dataKey="renewals" stroke="#3B82F6" strokeWidth={2} name="Renewals" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Property Portfolio Distribution</CardTitle>
            <CardDescription>Breakdown of property types and units</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={propertyTypeData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="units"
                    label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {propertyTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Tenant-specific charts
  if (type === "tenants") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Tenant Activity Trends</CardTitle>
            <CardDescription>Monthly tenant movements and renewals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tenantActivityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Legend />
                  <Line type="monotone" dataKey="newTenants" stroke="#10B981" strokeWidth={2} name="New Tenants" />
                  <Line type="monotone" dataKey="moveOuts" stroke="#EF4444" strokeWidth={2} name="Move Outs" />
                  <Line type="monotone" dataKey="renewals" stroke="#3B82F6" strokeWidth={2} name="Renewals" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Property-specific charts
  if (type === "properties") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Property Portfolio Distribution</CardTitle>
            <CardDescription>Breakdown of property types and units</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={propertyTypeData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="units"
                    label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {propertyTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Occupancy Rate Trends</CardTitle>
            <CardDescription>Monthly occupancy performance and vacant units</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={occupancyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="occupancy"
                    stroke="#10B981"
                    strokeWidth={2}
                    name="Occupancy %"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="vacantUnits"
                    stroke="#EF4444"
                    strokeWidth={2}
                    name="Vacant Units"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Maintenance-specific charts
  if (type === "maintenance") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Maintenance Requests by Type</CardTitle>
            <CardDescription>Request volume by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={maintenanceByTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Legend />
                  <Bar dataKey="requests" fill="#3B82F6" name="Requests" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}

export default AnalyticsCharts
