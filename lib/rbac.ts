export type AccessLevel = "none" | "read" | "write" | "delete" | "manage" | "admin"
export type Module =
  | "properties"
  | "tenants"
  | "leases"
  | "payments"
  | "maintenance_requests"
  | "reports"
  | "company_settings"
  | "user_management"

export interface UserAccess {
  [key: string]: AccessLevel[]
}

export interface RBACUser {
  id: string
  role?: string
  is_company_owner?: boolean
  access?: UserAccess[]
  company_account_id?: string
}

/**
 * Check if user has required access level for a specific module
 */
export function hasAccess(user: RBACUser | null, module: Module, requiredLevel: AccessLevel): boolean {
  if (!user) return false

  // Company owners have full access to everything
  if (user.is_company_owner) return true

  // Check if user has admin access in any module (grants full system access)
  if (user.access && Array.isArray(user.access)) {
    for (const accessObj of user.access) {
      if (typeof accessObj === "object" && accessObj !== null) {
        for (const moduleKey in accessObj) {
          const levels = accessObj[moduleKey]
          if (Array.isArray(levels) && levels.includes("admin")) {
            return true
          }
        }
      }
    }
  }

  // Check specific module access
  if (user.access && Array.isArray(user.access)) {
    for (const accessObj of user.access) {
      if (typeof accessObj === "object" && accessObj !== null && accessObj[module]) {
        const levels = accessObj[module]
        if (Array.isArray(levels)) {
          // Check if user has the required level or higher
          const accessHierarchy: AccessLevel[] = ["none", "read", "write", "delete", "manage", "admin"]
          const userHighestLevel = Math.max(...levels.map((level) => accessHierarchy.indexOf(level)))
          const requiredLevelIndex = accessHierarchy.indexOf(requiredLevel)

          return userHighestLevel >= requiredLevelIndex
        }
      }
    }
  }

  return false
}

/**
 * Get user's highest access level for a specific module
 */
export function getUserAccessLevel(user: RBACUser | null, module: Module): AccessLevel {
  if (!user) return "none"

  // Company owners have admin access
  if (user.is_company_owner) return "admin"

  // Check for admin access in any module
  if (user.access && Array.isArray(user.access)) {
    for (const accessObj of user.access) {
      if (typeof accessObj === "object" && accessObj !== null) {
        for (const moduleKey in accessObj) {
          const levels = accessObj[moduleKey]
          if (Array.isArray(levels) && levels.includes("admin")) {
            return "admin"
          }
        }
      }
    }
  }

  // Check specific module access
  if (user.access && Array.isArray(user.access)) {
    for (const accessObj of user.access) {
      if (typeof accessObj === "object" && accessObj !== null && accessObj[module]) {
        const levels = accessObj[module]
        if (Array.isArray(levels) && levels.length > 0) {
          const accessHierarchy: AccessLevel[] = ["none", "read", "write", "delete", "manage", "admin"]
          const highestLevel = levels.reduce((highest, current) => {
            const currentIndex = accessHierarchy.indexOf(current)
            const highestIndex = accessHierarchy.indexOf(highest)
            return currentIndex > highestIndex ? current : highest
          }, "none" as AccessLevel)

          return highestLevel
        }
      }
    }
  }

  return "none"
}

/**
 * Check if user can access a specific route based on their permissions
 */
export function canAccessRoute(user: RBACUser | null, route: string): boolean {
  if (!user) return false

  // Company owners can access everything
  if (user.is_company_owner) return true

  // Route to module mapping
  const routeModuleMap: { [key: string]: { module: Module; level: AccessLevel } } = {
    "/buildings": { module: "properties", level: "read" },
    "/new-building": { module: "properties", level: "write" },
    "/vacant-units": { module: "properties", level: "read" },
    "/new-vacant-unit": { module: "properties", level: "write" },
    "/tenants": { module: "tenants", level: "read" },
    "/tenants/add": { module: "tenants", level: "write" },
    "/notices": { module: "leases", level: "read" },
    "/finances": { module: "payments", level: "read" },
    "/finances/invoices": { module: "payments", level: "read" },
    "/finances/receipts": { module: "payments", level: "read" },
    "/analytics": { module: "reports", level: "read" },
    "/settings": { module: "company_settings", level: "read" },
    "/admin": { module: "user_management", level: "read" },
    "/admin/roles": { module: "user_management", level: "manage" },
    "/admin/add-agent": { module: "user_management", level: "write" },
  }

  const routeConfig = routeModuleMap[route]
  if (!routeConfig) {
    // Allow access to routes not in the map (like dashboard, profile, etc.)
    return true
  }

  return hasAccess(user, routeConfig.module, routeConfig.level)
}

/**
 * Hook to check permissions in React components
 */
export function usePermissions() {
  return {
    hasAccess,
    getUserAccessLevel,
    canAccessRoute,
  }
}
