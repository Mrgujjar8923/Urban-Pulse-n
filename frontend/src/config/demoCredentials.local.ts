export interface DemoAccountCredential {
  key: string;
  label: string;
  category: "citizen" | "admin" | "authority" | "officer";
  email: string;
  password?: string;
  department?: string;
  expectedRole: "citizen" | "admin" | "authority";
  isOfficer?: boolean;
  expectedDashboard: string;
}

export const DEMO_CREDENTIALS: DemoAccountCredential[] = [
  {
    key: "citizen",
    label: "Citizen Demo",
    category: "citizen",
    email: "citizen.demo@govai.gov",
    password: "12345678",
    expectedRole: "citizen",
    expectedDashboard: "/citizen",
  },
  {
    key: "admin",
    label: "Admin Demo",
    category: "admin",
    email: "admin@govai.gov",
    password: "12345678",
    expectedRole: "admin",
    expectedDashboard: "/admin",
  },
  {
    key: "authority_road",
    label: "Road & Infrastructure Authority",
    category: "authority",
    department: "Road & Infrastructure",
    email: "authority@demo.com",
    password: "12345678",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_water",
    label: "Water Supply Authority",
    category: "authority",
    department: "Water Supply",
    email: "water@demo.com",
    password: "12345678",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_electricity",
    label: "Electricity Authority",
    category: "authority",
    department: "Electricity",
    email: "electricity@demo.com",
    password: "12345678",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "authority_environment",
    label: "Environment Authority",
    category: "authority",
    department: "Environment",
    email: "environment@demo.com",
    password: "12345678",
    expectedRole: "authority",
    expectedDashboard: "/department",
  },
  {
    key: "officer_road",
    label: "Road Officer",
    category: "officer",
    department: "Road & Infrastructure",
    email: "road.demo@govai.gov",
    password: "12345678",
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
    password: "12345678",
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
    password: "12345678",
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
    password: "12345678",
    expectedRole: "authority",
    isOfficer: true,
    expectedDashboard: "/department",
  },
];
