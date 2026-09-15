import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { requestPasswordReset } from "../../api/auth";

export default function Login() {
  const { login, status, error: authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isLoading = status === "loading";

  // Preserve the original destination when redirecting to login
  const from = (location.state as { from?: string } | null)?.from;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Enter your email or username and password.");
      return;
    }

    try {
      const user = await login({ email: email.trim(), password, rememberMe });
      // Route users based on the role returned by the backend
      if (from) {
        navigate(from, { replace: true });
      } else if (user.role === "ADMIN") {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/supplier/dashboard", { replace: true });
      }
    } catch {
      // authError from context already carries a user-facing message
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setFormError("Enter your email, then select Forgot password.");
      return;
    }
    setFormError(null);
    try {
      await requestPasswordReset(email.trim());
      setResetMessage("If that account exists, we've sent password reset instructions.");
    } catch {
      setResetMessage("Couldn't send reset instructions right now. Please try again.");
    }
  }

  const displayError = formError ?? authError;

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-100 shadow-card p-8">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <img src="/logo.png" alt="" className="h-16 w-16 rounded-2xl" />
        </div>

        {/* Title */}
        <h1 className="text-center text-xl font-bold text-gray-900 leading-snug">
          Environmental Monitoring &amp; Contract Compliance
        </h1>
        <p className="text-center text-sm font-normal text-gray-500 mt-1 mb-7">
          Municipal Environmental Monitoring System
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Email / Username */}
          <div className="mb-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-1.5">
              Email or Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="advisor.hansen@kommune.no"
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2.5 text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700 disabled:bg-gray-50"
              />
            </div>
          </div>
          <p className="text-xs font-normal text-gray-400 mb-5">
            Single sign-in for municipal advisors &amp; registered suppliers
          </p>

          {/* Password */}
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-800">
              Password
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm font-medium text-secondary-700 hover:text-secondary-700"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative mb-4">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={isLoading}
              className="w-full rounded-lg border border-gray-200 pl-10 pr-10 py-2.5 text-sm font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-700/30 focus:border-primary-700 disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-700 focus:ring-primary-700/30"
            />
            <span className="text-sm font-normal text-gray-700">Remember this workstation for 30 days</span>
          </label>

          {(displayError || resetMessage) && (
            <div
              role="status"
              className={`mb-4 rounded-lg px-3 py-2 text-sm font-normal ${
                displayError ? "bg-red-50 text-red-700" : "bg-tertiary-50 text-primary-700"
              }`}
            >
              {displayError ?? resetMessage}
            </div>
          )}

          {/* Sign in */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary-900 hover:bg-primary-700 text-white font-semibold py-2.5 text-sm transition-colors disabled:opacity-70"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Info box */}
        <div className="mt-6 rounded-lg bg-gray-50 border border-gray-100 px-3 py-3 flex gap-2">
          <Info className="h-4 w-4 text-secondary-700 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">Automatic RBAC Destination: </span>
            Your authorized role (<span className="font-semibold">Admin</span> or{" "}
            <span className="font-semibold">Supplier</span>) is authenticated server-side. You
            will be redirected directly to your designated compliance workspace.
          </p>
        </div>
      </div>
    </div>
  );
}