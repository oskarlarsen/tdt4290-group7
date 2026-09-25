export type Role = "ADMIN" | "SUPPLIER";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  // Present only for SUPPLIER users
  supplierId?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export type LoginResponse = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};