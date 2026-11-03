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
      supplierId: "sup-c",
    },
  },
};

// Stands in for the backend's session cookie; holds only the mock user's email, never a token
const MOCK_SESSION_KEY = "mock_session_email";

function userFromSession(): AuthUser | null {
  try {
    const email = sessionStorage.getItem(MOCK_SESSION_KEY);
    return email ? (MOCK_USERS[email]?.user ?? null) : null;
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

  sessionStorage.setItem(MOCK_SESSION_KEY, email.toLowerCase());
  return {
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    user: entry.user,
  };
}

export async function mockGetCurrentUser(): Promise<AuthUser> {
  const user = userFromSession();
  if (!user) throw new Error("No session");
  return user;
}

export async function mockLogout(): Promise<void> {
  sessionStorage.removeItem(MOCK_SESSION_KEY);
}

export async function mockRequestPasswordReset(_email: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
}