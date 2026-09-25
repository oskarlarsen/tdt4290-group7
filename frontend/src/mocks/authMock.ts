import type { AuthUser, LoginRequest, LoginResponse } from "../types/auth";

/// Test accounts used to run the frontend before the real auth endpoint is available
const MOCK_USERS: Record<string, { password: string; user: AuthUser }> = {
  "admin@kommune.no": {
    password: "admin123",
    user: {
      id: "admin-1",
      name: "Hansen (Environmental Advisor)",
      email: "admin@kommune.no",
      role: "ADMIN",
    },
  },
  "supplier@leverandor.no": {
    password: "supplier123",
    user: {
      id: "supplier-1",
      name: "Leverandør 1",
      email: "supplier@leverandor.no",
      role: "SUPPLIER",
      supplierId: "supplier-1",
    },
  },
};

// Include the user data needed to restore the mock session after refresh
function tokenFor(email: string) {
  return `mock-token.${btoa(email)}`;
}

function userFromToken(token: string): AuthUser | null {
  const [, encoded] = token.split("mock-token.");
  if (!encoded) return null;
  try {
    const email = atob(encoded);
    return MOCK_USERS[email]?.user ?? null;
  } catch {
    return null;
  }
}

export async function mockLogin({ email, password }: LoginRequest): Promise<LoginResponse> {
  await new Promise((r) => setTimeout(r, 400)); // simulate network latency

  const entry = MOCK_USERS[email.toLowerCase()];
  if (!entry || entry.password !== password) {
    throw new Error("Invalid email/username or password");
  }

  return {
    token: tokenFor(email.toLowerCase()),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    user: entry.user,
  };
}

export async function mockGetCurrentUser(token: string): Promise<AuthUser> {
  const user = userFromToken(token);
  if (!user) throw new Error("Session expired");
  return user;
}

export async function mockLogout(): Promise<void> {
  return;
}

export async function mockRequestPasswordReset(_email: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
}