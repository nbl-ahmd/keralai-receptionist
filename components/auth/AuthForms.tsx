"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { signIn, signUp } from "@/lib/auth/client";

/** Only allow same-origin relative redirects, so `?next=` can't be abused. */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message || "That email and password combination did not work.");
        return;
      }
      router.replace(next as Route);
      router.refresh();
    } catch {
      setError("Could not sign you in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {error && (
        <Notice tone="error" className="items-center">
          {error}
        </Notice>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          aria-invalid={Boolean(error) || undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          aria-invalid={Boolean(error) || undefined}
        />
      </div>

      <Button type="submit" className="w-full gap-2" disabled={isSubmitting} size="lg">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href={(next === "/dashboard" ? "/register" : `/register?next=${encodeURIComponent(next)}`) as Route}
          className="font-semibold text-primary-soft-foreground hover:underline"
        >
          Create your workspace
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp.email({
        email: email.trim(),
        password,
        name: name.trim() || email.trim().split("@")[0],
      });
      if (result.error) {
        setError(result.error.message || "Could not create your account. Try a different email.");
        return;
      }
      router.replace(next as Route);
      router.refresh();
    } catch {
      setError("Could not create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {error && (
        <Notice tone="error" className="items-center">
          {error}
        </Notice>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="register-name">Name</Label>
        <Input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          aria-describedby="register-password-hint"
        />
        <p id="register-password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-confirm">Confirm password</Label>
        <Input
          id="register-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Repeat your password"
        />
      </div>

      <Button type="submit" className="w-full gap-2" disabled={isSubmitting} size="lg">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? "Creating workspace…" : "Create workspace"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={(next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`) as Route}
          className="font-semibold text-primary-soft-foreground hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
