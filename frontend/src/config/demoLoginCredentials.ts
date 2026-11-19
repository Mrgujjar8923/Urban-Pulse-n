type DemoCredentialKey =
  | "citizen"
  | "admin"
  | "roadAuthority"
  | "waterAuthority"
  | "electricityAuthority"
  | "environmentAuthority"
  | "roadOfficer"
  | "waterOfficer"
  | "electricityOfficer"
  | "environmentOfficer";

const isLoopbackHost = () => {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
};

const envMap: Record<DemoCredentialKey, string> = {
  citizen: "VITE_DEMO_CITIZEN_PASSWORD",
  admin: "VITE_DEMO_ADMIN_PASSWORD",
  roadAuthority: "VITE_DEMO_ROAD_AUTHORITY_PASSWORD",
  waterAuthority: "VITE_DEMO_WATER_AUTHORITY_PASSWORD",
  electricityAuthority: "VITE_DEMO_ELECTRICITY_AUTHORITY_PASSWORD",
  environmentAuthority: "VITE_DEMO_ENVIRONMENT_AUTHORITY_PASSWORD",
  roadOfficer: "VITE_DEMO_ROAD_OFFICER_PASSWORD",
  waterOfficer: "VITE_DEMO_WATER_OFFICER_PASSWORD",
  electricityOfficer: "VITE_DEMO_ELECTRICITY_OFFICER_PASSWORD",
  environmentOfficer: "VITE_DEMO_ENVIRONMENT_OFFICER_PASSWORD",
};

const localKeyMap: Record<DemoCredentialKey, string> = {
  citizen: "citizen",
  admin: "admin",
  roadAuthority: "authority_road",
  waterAuthority: "authority_water",
  electricityAuthority: "authority_electricity",
  environmentAuthority: "authority_environment",
  roadOfficer: "officer_road",
  waterOfficer: "officer_water",
  electricityOfficer: "officer_electricity",
  environmentOfficer: "officer_environment",
};

export const getDemoPassword = async (key: DemoCredentialKey): Promise<string | undefined> => {
  if (!import.meta.env.DEV || !isLoopbackHost()) return undefined;

  // 1. In test environments (or dynamic env access), check import.meta.env
  const envKey = envMap[key];
  if (envKey && typeof import.meta.env[envKey] === "string" && import.meta.env[envKey]) {
    return import.meta.env[envKey];
  }

  // The ignored local file is loaded only by the development server.
  const localModule = await import(/* @vite-ignore */ "./demoCredentials.local");
  const mappedKey = localKeyMap[key];
  const found = localModule.DEMO_CREDENTIALS?.find((credential: { key: string }) => (
    credential.key === mappedKey || credential.key === key
  ));
  return found?.password;
};

export type { DemoCredentialKey };
