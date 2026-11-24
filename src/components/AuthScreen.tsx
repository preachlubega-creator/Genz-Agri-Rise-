import { useState, type FormEvent } from 'react';
import { Building2, Lock } from 'lucide-react';
import type { SessionUser } from '../domain/types';

interface AuthScreenProps {
  availableAccounts: SessionUser[];
  onLogin: (email: string, password: string) => Promise<void>;
  onQuickSwitch: (userId: string) => Promise<void>;
}

export function AuthScreen({
  availableAccounts,
  onLogin,
  onQuickSwitch,
}: AuthScreenProps) {
  const [email, setEmail] = useState('grace.nabwire@genzagririse.org');
  const [password, setPassword] = useState('demo-founder-password');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7F5] p-6">
      <div className="w-full max-w-md rounded-xl border border-[#E4E7E2] bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#141815] text-[#A3E635]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-[#141815]">
              Gen Z AgriRise
            </h1>
            <p className="text-xs text-[#5F6660]">
              Internal Organisational Management System
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-[#141815]"
            >
              Organisational Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-[#141815]"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#141815] px-4 py-2.5 text-xs font-medium text-[#D9F99D] transition-colors hover:bg-[#272D28] disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{loading ? 'Signing in...' : 'Sign in to Workspace'}</span>
          </button>
        </form>

        {availableAccounts.length > 0 && (
          <div className="mt-6 border-t border-[#ECEEE9] pt-4">
            <div className="text-[11px] font-medium text-[#5F6660]">
              Quick Role Access (Internal RBAC Verification)
            </div>
            <div className="mt-2 space-y-1.5">
              {availableAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onQuickSwitch(acc.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] px-3 py-2 text-left text-xs transition-colors hover:border-[#84CC16] hover:bg-[#ECFCCB]"
                >
                  <span className="font-medium text-[#141815]">
                    {acc.fullName}
                  </span>
                  <span className="text-[11px] text-[#5F6660]">{acc.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
