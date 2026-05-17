"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/auth/validation";

type FieldErrors = Partial<Record<keyof LoginInput, string>>;

// Route: /login
export default function LoginPage() {
  const router = useRouter();

  const [values, setValues] = useState<LoginInput>({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name as keyof LoginInput]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    // Client-side validation
    const result = loginSchema.safeParse(values);
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginInput;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setServerError(body?.message ?? "Email atau password salah.");
        return;
      }

      router.push("/");
    } catch {
      setServerError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm">
      {/* Header */}
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Masuk</h1>
      <p className="mb-6 text-sm text-gray-500">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
          Daftar sekarang
        </Link>
      </p>

      {/* Server error banner */}
      {serverError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={handleChange}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            aria-invalid={!!fieldErrors.email}
            placeholder="kamu@contoh.com"
            className={[
              "block w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400",
              "outline-none transition focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0",
              fieldErrors.email
                ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-300"
                : "border-gray-300 bg-white focus:border-indigo-500",
            ].join(" ")}
          />
          {fieldErrors.email && (
            <p id="email-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Lupa password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={values.password}
              onChange={handleChange}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              aria-invalid={!!fieldErrors.password}
              placeholder="••••••••"
              className={[
                "block w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400",
                "outline-none transition focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0",
                fieldErrors.password
                  ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-300"
                  : "border-gray-300 bg-white focus:border-indigo-500",
              ].join(" ")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path
                    fillRule="evenodd"
                    d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z"
                    clipRule="evenodd"
                  />
                  <path d="M10.748 13.93l2.523 2.523a10.003 10.003 0 01-8.516-1.168l1.338-1.338a2.5 2.5 0 003.655-.017zm4.908-4.908l1.338-1.338a10.003 10.003 0 011.168 8.516l-2.523-2.523a2.5 2.5 0 00.017-3.655z" />
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="password-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
