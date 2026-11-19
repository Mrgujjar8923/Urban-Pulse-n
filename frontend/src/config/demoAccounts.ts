export interface DemoAccountConfig {
  key: string;
  label: string;
  category: "citizen" | "admin" | "authority" | "officer";
  email: string;
  department?: string;
  expectedRole: "citizen" | "admin" | "authority";
  isOfficer?: boolean;
  expectedDashboard: string;
}

export const DEMO_ACCOUNTS: DemoAccountConfig[] = [
  {
    key: "citizen",
    label: "Citizen Demo",
    category: "citizen",
    email: "citizen.demo@govai.gov",
    expectedRole: "citizen",
    expectedDashboard: "/citizen",
  },
  {
    key: "admin",
    label: "Admin Demo",
    category: "admin",
    email: "admin@govai.gov",
    expectedRole: "admin",
    expectedDashboard: "/admin",
  },
  {
    key: "authority_road",
    label: "Road & Infrastructure Authority",
    category: "authority",
    department: "Road & Infrastructure",
    email: "authority@demo.com",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_water",
    label: "Water Supply Authority",
    category: "authority",
    department: "Water Supply",
    email: "water@demo.com",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_electricity",
    label: "Electricity Authority",
    category: "authority",
    department: "Electricity",
    email: "electricity@demo.com",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_environment",
    label: "Environment Authority",
    category: "authority",
    department: "Environment",
    email: "environment@demo.com",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "officer_road",
    label: "Road Officer",
    category: "officer",
    department: "Road & Infrastructure",
    email: "road.demo@govai.gov",
    expectedRole: "authority",
    isOfficer: true,
    expectedDashboard: "/department",
  },
  {
    key: "officer_water",
    label: "Water Officer",
    category: "officer",
    department: "Water Supply",
    email: "water.demo@govai.gov",
    expectedRole: "authority",
    isOfficer: true,
    expectedDashboard: "/department",
  },
  {
    key: "officer_electricity",
    label: "Electricity Officer",
    category: "officer",
    department: "Electricity",
    email: "electricity.demo@govai.gov",
    expectedRole: "authority",
    isOfficer: true,
    expectedDashboard: "/department",
  },
  {
    key: "officer_environment",
    label: "Environment Officer",
    category: "officer",
    department: "Environment",
    email: "environment.demo@govai.gov",
    expectedRole: "authority",
    isOfficer: true,
    expectedDashboard: "/department",
  },
];

// Lazy resolver for dev credentials that never bundles plaintext passwords into production
export async function getDemoAccountPassword(email: string): Promise<string | undefined> {
  if (import.meta.env.DEV) {
    try {
      // Dynamic import of local development-only config
      const mod = await import("./demoCredentials.local");
      const found = mod.DEMO_CREDENTIALS.find((c: { email: string }) => c.email.toLowerCase() === email.toLowerCase());
      return found?.password;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

