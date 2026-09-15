export type Role = "ADMIN" | "SUPPLIER";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  // Supplier data is scoped here instead of using an ID from the frontend
  supplierId?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
  rememberMe: boolean;
};

// Backend response containing the JWT and user role
export type LoginResponse = {
  token: string;
  expiresAt: string; 
  user: AuthUser;
};