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

// Backend response with the user role; the JWT itself is set as an HttpOnly cookie
export type LoginResponse = {
  expiresAt: string;
  user: AuthUser;
};