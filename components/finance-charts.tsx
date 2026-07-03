"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AreaChart,
  Area,
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
const revenueBreakdownData = [
  { month: "Jan", rent: 8500000, deposits: 1200000, fees: 450000, maintenance: 320000 },
  { month: "Feb", rent: 8750000, deposits: 980000, fees: 520000, maintenance: 280000 },
  { month: "Mar", rent: 9100000, deposits: 1450000, fees: 480000, maintenance: 410000 },
  { month: "Apr", rent: 8900000, deposits: 1100000, fees: 510000, maintenance: 350000 },
  { month: "May", rent: 9300000, deposits: 1350000, fees: 580000, maintenance: 390000 },
  { month: "Jun", rent: 9500000, deposits: 1200000, fees: 620000, maintenance: 420000 },
]

const expenseBreakdownData = [
  { category: "Maintenance", amount: 2100000, percentage: 35, color: "#EF4444" },
  { category: "Utilities", amount: 1800000, percentage: 30, color: "#F59E0B" },
  { category: "Insurance", amount: 900000, percentage: 15, color: "#3B82F6" },
  { category: "Property Tax", amount: 600000, percentage: 10, color: "#8B5CF6" },
  { category: "Management", amount: 600000, percentage: 10, color: "#10B981" },
]

const profitMarginData = [
  { month: "Jan", revenue: 10470000, expenses: 6200000, profit: 4270000, margin: 40.8 },
  { month: "Feb", revenue: 10530000, expenses: 6100000, profit: 4430000, margin: 42.1 },
  { month: "Mar", revenue: 11440000, expenses: 6800000, profit: 4640000, margin: 40.6 },
  { month: "Apr", revenue: 10860000, expenses: 6400000, profit: 4460000, margin: 41.1 },
  { month: "May", revenue: 11620000, expenses: 6900000, profit: 4720000, margin: 40.6 },
  { month: "Jun", revenue: 11740000, expenses: 7100000, profit: 4640000, margin: 39.5 },
]

const cashFlowData = [
  { month: "Jan", inflow: 10470000, outflow: 6200000, netFlow: 4270000 },
  { month: "Feb", inflow: 10530000, outflow: 6100000, netFlow: 4430000 },
  { month: "Mar", inflow: 11440000, outflow: 6800000, netFlow: 4640000 },
  { month: "Apr", inflow: 10860000, outflow: 6400000, netFlow: 4460000 },
  { month: "May", inflow: 11620000, outflow: 6900000, netFlow: 4720000 },
  { month: "Jun", inflow: 11740000, outflow: 7100000, netFlow: 4640000 },
]

interface FinanceChartsProps {
  type?: "overview" | "revenue" | "expenses" | "cashflow"
}

export function FinanceCharts({ type = "overview" }: FinanceChartsProps) {
  // Overview shows a simplified dashboard with fewer charts
  if (type === "overview") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
            <CardDescription>Monthly revenue streams</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueBreakdownData.slice(0, 3)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                  <Legend />
                  <Area type="monotone" dataKey="rent" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.8} />
                  <Area
                    type="monotone"
                    dataKey="deposits"
                    stackId="1"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.8}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Expense Distribution</CardTitle>
            <CardDescription>Breakdown of operational expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdownData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="amount"
                    label={({ category, percentage }: any) => `${category} ${percentage}%`}
                  >
                    {expenseBreakdownData.map((entry, index) => (
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

  // Revenue-specific charts
  if (type === "revenue") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Revenue Breakdown Analysis</CardTitle>
            <CardDescription>Monthly revenue streams and sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                  <Legend />
                  <Area type="monotone" dataKey="rent" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.8} />
                  <Area
                    type="monotone"
                    dataKey="deposits"
                    stackId="1"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.8}
                  />
                  <Area type="monotone" dataKey="fees" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.8} />
                  <Area
                    type="monotone"
                    dataKey="maintenance"
                    stackId="1"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.8}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Expenses-specific charts
  if (type === "expenses") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Expense Distribution</CardTitle>
            <CardDescription>Breakdown of operational expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdownData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="amount"
                    label={({ category, percentage }: any) => `${category} ${percentage}%`}
                  >
                    {expenseBreakdownData.map((entry, index) => (
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

  // Cash flow-specific charts
  if (type === "cashflow") {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Cash Flow Analysis</CardTitle>
            <CardDescription>Monthly cash inflows, outflows, and net cash flow</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                  <Legend />
                  <Bar dataKey="inflow" fill="#10B981" name="Cash Inflow" />
                  <Bar dataKey="outflow" fill="#EF4444" name="Cash Outflow" />
                  <Bar dataKey="netFlow" fill="#3B82F6" name="Net Cash Flow" />
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

export default FinanceCharts
