import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { authApi, AuthApiUser } from "@/services/authApi";
import { ApiError, setUnauthorizedHandler } from "@/services/apiClient";

export type UserRole = "citizen" | "authority" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  departmentRole?: "authority" | "officer" | null;
  status?: "active" | "pending" | "rejected";
  isOfficer?: boolean;
  memberId?: string | null;
  memberName?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, role?: UserRole, department?: string, departmentRole?: "authority" | "officer") => Promise<User>;
  refreshAuthenticatedUser: () => Promise<User>;
  register: (name: string, email: string, password: string, role: UserRole, department?: string) => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, "name" | "avatar" | "phone">>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_USER_KEY = "govai_user";
const STORAGE_TOKEN_KEY = "govai_token";

const mapServerRoleToClient = (role: AuthApiUser["role"]): UserRole => (
  role === "department" ? "authority" : role
);

const mapClientRoleToServer = (role: UserRole): AuthApiUser["role"] => (
  role === "authority" ? "department" : role
);

const normalizeUser = (user: (Partial<User> & { role?: string; departmentRole?: "authority" | "officer" | null }) | null): User | null => {
  if (!user?.id || !user?.email || !user?.name || !user?.role) {
    return null;
  }

  const clientRole = mapServerRoleToClient(user.role as AuthApiUser["role"]);
  const isDept = clientRole === "authority";
  const departmentRole = isDept ? user.departmentRole || null : null;
  const isOfficer = isDept && departmentRole === "officer";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: clientRole,
    department: user.department,
    departmentRole,
    avatar: user.avatar,
    status: user.status,
    isOfficer,
    memberId: user.memberId || null,
    memberName: user.memberName || null,
  };
};

const toClientUser = (user: AuthApiUser): User => {
  const clientRole = mapServerRoleToClient(user.role);
  const isDept = clientRole === "authority";
  const departmentRole = isDept ? user.departmentRole || null : null;
  const isOfficer = isDept && departmentRole === "officer";

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: clientRole,
    avatar: user.avatar || undefined,
    department: user.department || undefined,
    departmentRole,
    status: user.status,
    isOfficer,
    memberId: user.memberId || null,
    memberName: user.memberName || null,
  };
};

const persistUser = (nextUser: User) => {
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
};

const persistSession = (nextUser: User, token: string) => {
  persistUser(nextUser);
  localStorage.setItem(STORAGE_TOKEN_KEY, token);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_USER_KEY);
    return saved ? normalizeUser(JSON.parse(saved)) : null;
  });

  const isEvictingRef = useRef(false);

  const handleUnauthorized = useCallback(() => {
    if (isEvictingRef.current) return;
    const hasToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    const hasUser = localStorage.getItem(STORAGE_USER_KEY);
    if (!hasToken && !hasUser && !user) {
      return;
    }
    isEvictingRef.current = true;
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    setUser(null);
    setTimeout(() => {
      isEvictingRef.current = false;
    }, 1000);
  }, [user]);

  const handleUnauthorizedRef = useRef<() => void>(handleUnauthorized);
  handleUnauthorizedRef.current = handleUnauthorized;

  useEffect(() => {
    setUnauthorizedHandler(() => {
      handleUnauthorizedRef.current?.();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (token) {
      authApi.getMe()
        ?.then((res) => {
          if (res?.user) {
            const next = toClientUser(res.user);
            setUser(next);
            persistUser(next);
          }
        })
        ?.catch((error: unknown) => {
          // Evict only on genuine authentication failure (401), not ordinary authorization denial (403)
          if (error instanceof ApiError && error.status === 401) {
            handleUnauthorizedRef.current?.();
          }
        });
    }
  }, []);

  const login = useCallback(async (email: string, password: string, role?: UserRole, department?: string, departmentRole?: "authority" | "officer") => {
    const response = await authApi.login({
      email,
      password,
      role: role ? mapClientRoleToServer(role) : undefined,
      department,
      departmentRole,
    });
    const nextUser = toClientUser(response.user);

    if (role && nextUser.role !== role) {
      throw new Error(`This account is registered as ${nextUser.role}, not ${role}.`);
    }

    if (!response.token) {
      throw new Error("Authentication token missing from server response.");
    }

    setUser(nextUser);
    persistSession(nextUser, response.token);
    return nextUser;
  }, []);

  const refreshAuthenticatedUser = useCallback(async () => {
    const response = await authApi.getMe();
    const nextUser = toClientUser(response.user);
    setUser(nextUser);
    persistUser(nextUser);
    return nextUser;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: UserRole, department?: string) => {
    if (role === "admin") throw new Error("Admin registration is not allowed.");

    const response = await authApi.register({
      name,
      email,
      password,
      role: mapClientRoleToServer(role),
      department,
    });

    const nextUser = toClientUser(response.user);

    if (nextUser.role === "authority" && nextUser.status === "pending") {
      throw new Error("AUTHORITY_PENDING");
    }

    if (!response.token) {
      throw new Error(response.message || "Registration succeeded but no login session was created.");
    }

    setUser(nextUser);
    persistSession(nextUser, response.token);
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<User, "name" | "avatar">>) => {
    setUser((current) => {
      if (!current) return current;
      const nextUser = {
        ...current,
        ...updates,
      };
      persistUser(nextUser);
      return nextUser;
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, refreshAuthenticatedUser, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
