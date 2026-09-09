type Role = "admin" | "supplier";
type User = { id: string; name: string; role: Role; supplierId?: string };

// TODO: replace with real auth/session logic (JWT, refresh, etc.)
export function useAuth() {
  const user: User | null = null;
  return { user, login: async (_email: string, _password: string) => {}, logout: () => {} };
}
