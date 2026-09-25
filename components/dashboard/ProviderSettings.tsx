"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Check,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Phone,
  PhoneOutgoing,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
  Webhook,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SecretMeta {
  provider: string;
  keyName: string;
  maskedSuffix: string | null;
  keyVersion: number;
  updatedAt: string;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  isLegacy: boolean;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  isLegacy: boolean;
}

interface ExotelState {
  credential: { configured: boolean; tokenLast4: string | null; rotatedAt: string | null };
  slug: string | null;
  wsUrl: string | null;
  wsUrlQuery: string | null;
}

const SETTING = {
  textModel: "gemini.text_model",
  liveModel: "gemini.live_model",
  embeddingModel: "gemini.embedding_model",
  crmProvider: "crm.provider",
  crmWebhookUrl: "crm.webhook_url",
  exotelSubdomain: "exotel.subdomain",
  exotelPhoneNumber: "exotel.phone_number",
} as const;

const EXOTEL_SUBDOMAIN_OPTIONS = [
  { value: "api.exotel.com", label: "Singapore — api.exotel.com" },
  { value: "api.in.exotel.com", label: "Mumbai — api.in.exotel.com" },
] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-600" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
        tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {tone === "ok" ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

function SecretField({
  label,
  placeholder,
  value,
  onChange,
  configured,
  disabled,
  onRemove,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  configured?: SecretMeta;
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        {label}
        {configured && (
          <span className="font-normal text-emerald-600">
            configured{configured.maskedSuffix ? ` ${configured.maskedSuffix}` : ""}
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          placeholder={configured ? "Replace…" : placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        {configured && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${label}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProviderSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [role, setRole] = useState<string>("member");
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  const [secrets, setSecrets] = useState<SecretMeta[]>([]);

  const [geminiKey, setGeminiKey] = useState("");
  const [savingGemini, setSavingGemini] = useState(false);

  const [crmProvider, setCrmProvider] = useState<"none" | "webhook">("none");
  const [crmWebhookUrl, setCrmWebhookUrl] = useState("");
  const [crmSecretInput, setCrmSecretInput] = useState("");
  const [savingCrm, setSavingCrm] = useState(false);

  const [models, setModels] = useState({ text: "", live: "", embedding: "" });
  const [savingModels, setSavingModels] = useState(false);

  const [exotel, setExotel] = useState<ExotelState | null>(null);
  const [rotating, setRotating] = useState(false);
  const [freshExotel, setFreshExotel] = useState<{
    token: string;
    wsUrl: string;
    wsUrlQuery: string;
  } | null>(null);

  const [exotelForm, setExotelForm] = useState({
    accountSid: "",
    apiKey: "",
    apiToken: "",
    appId: "",
  });
  const [exotelSubdomain, setExotelSubdomain] = useState<string>("api.exotel.com");
  const [exotelPhone, setExotelPhone] = useState("");
  const [savingExotelAccount, setSavingExotelAccount] = useState(false);
  const [verifyingExotel, setVerifyingExotel] = useState(false);
  const [exotelVerify, setExotelVerify] = useState<{ ok: boolean; message: string } | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState("");

  const canManage = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    try {
      const [tenantRes, settingsRes, secretsRes, exotelRes] = await Promise.all([
        fetch("/api/tenant", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/tenant/settings", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/tenant/secrets", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/tenant/exotel", { cache: "no-store" }).then((r) => r.json()),
      ]);

      if (tenantRes?.error) throw new Error(tenantRes.error);
      setTenant(tenantRes.tenant ?? null);
      setWorkspaceName(tenantRes.tenant?.name ?? "");
      setTenants(Array.isArray(tenantRes.tenants) ? tenantRes.tenants : []);
      setRole(tenantRes.role ?? "member");

      if (settingsRes?.settings) {
        const value = settingsRes.settings as Record<string, unknown>;
        setModels({
          text: asString(value[SETTING.textModel]),
          live: asString(value[SETTING.liveModel]),
          embedding: asString(value[SETTING.embeddingModel]),
        });
        setCrmProvider(value[SETTING.crmProvider] === "webhook" ? "webhook" : "none");
        setCrmWebhookUrl(asString(value[SETTING.crmWebhookUrl]));
        setExotelSubdomain(
          value[SETTING.exotelSubdomain] === "api.in.exotel.com"
            ? "api.in.exotel.com"
            : "api.exotel.com",
        );
        setExotelPhone(asString(value[SETTING.exotelPhoneNumber]));
      }
      setSecrets(Array.isArray(secretsRes?.secrets) ? secretsRes.secrets : []);
      setExotel(exotelRes?.error ? null : exotelRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000);
  };

  const saveWorkspace = async () => {
    if (!workspaceName.trim()) return;
    setSavingWorkspace(true);
    try {
      const response = await fetch("/api/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });
      const data = (await response.json()) as { error?: string; tenant?: TenantInfo };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to save workspace");
      if (data.tenant) setTenant(data.tenant);
      flash("Workspace name saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workspace");
    } finally {
      setSavingWorkspace(false);
    }
  };

  const saveModel = async (key: string, value: string) => {
    setSavingModels(true);
    try {
      const response = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: value.trim() || null }),
      });
      const data = (await response.json()) as { error?: string; settings?: Record<string, unknown> };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to save model");
      flash("Model setting saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSavingModels(false);
    }
  };

  const saveSecret = async (provider: string, keyName: string, value: string) => {
    const response = await fetch("/api/tenant/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, keyName, value }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok || data.error) throw new Error(data.error || "Failed to save credential");
    return data;
  };

  const deleteSecret = async (provider: string, keyName: string) => {
    const response = await fetch(
      `/api/tenant/secrets?provider=${encodeURIComponent(provider)}&keyName=${encodeURIComponent(keyName)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok || data.error) throw new Error(data.error || "Failed to remove credential");
  };

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) return;
    setSavingGemini(true);
    setError(null);
    try {
      await saveSecret("gemini", "api_key", geminiKey.trim());
      setGeminiKey("");
      await load();
      flash("Gemini API key saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Gemini key");
    } finally {
      setSavingGemini(false);
    }
  };

  const removeSecret = async (provider: string, keyName: string) => {
    try {
      await deleteSecret(provider, keyName);
      await load();
      flash("Credential removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove credential");
    }
  };

  const saveCrm = async () => {
    setSavingCrm(true);
    setError(null);
    try {
      const providerResponse = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: SETTING.crmProvider, value: crmProvider }),
      });
      const providerData = (await providerResponse.json()) as { error?: string };
      if (!providerResponse.ok || providerData.error) {
        throw new Error(providerData.error || "Failed to save CRM provider");
      }

      if (crmProvider === "webhook" && crmWebhookUrl.trim()) {
        const urlResponse = await fetch("/api/tenant/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: SETTING.crmWebhookUrl, value: crmWebhookUrl.trim() }),
        });
        const urlData = (await urlResponse.json()) as { error?: string };
        if (!urlResponse.ok || urlData.error) {
          throw new Error(urlData.error || "Failed to save webhook URL");
        }
      }

      if (crmSecretInput.trim()) {
        await saveSecret("crm", "webhook_secret", crmSecretInput.trim());
        setCrmSecretInput("");
      }

      await load();
      flash("CRM settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save CRM settings");
    } finally {
      setSavingCrm(false);
    }
  };

  const rotateExotel = async () => {
    setRotating(true);
    setError(null);
    try {
      const response = await fetch("/api/tenant/exotel", { method: "POST" });
      const data = (await response.json()) as {
        error?: string;
        token?: string;
        wsUrl?: string;
        wsUrlQuery?: string;
      };
      if (!response.ok || data.error || !data.token) {
        throw new Error(data.error || "Failed to rotate Exotel token");
      }
      setFreshExotel({
        token: data.token,
        wsUrl: data.wsUrl ?? "",
        wsUrlQuery: data.wsUrlQuery ?? "",
      });
      await load();
      flash("Exotel token rotated. Copy the URL now — it is shown once.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate Exotel token");
    } finally {
      setRotating(false);
    }
  };

  const saveSetting = async (key: string, value: unknown) => {
    const response = await fetch("/api/tenant/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok || data.error) throw new Error(data.error || "Failed to save setting");
  };

  const saveExotelAccount = async () => {
    setSavingExotelAccount(true);
    setError(null);
    try {
      // Only overwrite fields the user actually filled in, so partial edits are safe.
      if (exotelForm.accountSid.trim()) {
        await saveSecret("exotel", "account_sid", exotelForm.accountSid.trim());
      }
      if (exotelForm.apiKey.trim()) {
        await saveSecret("exotel", "api_key", exotelForm.apiKey.trim());
      }
      if (exotelForm.apiToken.trim()) {
        await saveSecret("exotel", "api_token", exotelForm.apiToken.trim());
      }
      if (exotelForm.appId.trim()) {
        await saveSecret("exotel", "app_id", exotelForm.appId.trim());
      }
      await saveSetting(SETTING.exotelSubdomain, exotelSubdomain);
      await saveSetting(SETTING.exotelPhoneNumber, exotelPhone.trim() || null);
      setExotelForm({ accountSid: "", apiKey: "", apiToken: "", appId: "" });
      await load();
      flash("Exotel account saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Exotel account");
    } finally {
      setSavingExotelAccount(false);
    }
  };

  const verifyExotelAccount = async () => {
    setVerifyingExotel(true);
    setExotelVerify(null);
    setError(null);
    try {
      const response = await fetch("/api/tenant/exotel/verify", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        phoneCount?: number;
        phoneNumbers?: { number: string | null }[];
      };
      if (data.ok) {
        const numbers = (data.phoneNumbers ?? [])
          .map((phone) => phone.number)
          .filter((value): value is string => Boolean(value));
        setExotelVerify({
          ok: true,
          message:
            `Connected — ${data.phoneCount ?? numbers.length} ExoPhone(s) on this account` +
            (numbers.length ? `: ${numbers.slice(0, 5).join(", ")}` : "."),
        });
      } else {
        setExotelVerify({ ok: false, message: data.error || "Verification failed." });
      }
    } catch {
      setExotelVerify({ ok: false, message: "Verification failed." });
    } finally {
      setVerifyingExotel(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flash("Copied to clipboard.");
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  };

  const claimLegacy = async () => {
    setClaiming(true);
    setClaimMessage(null);
    try {
      const response = await fetch("/api/tenant/claim-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: claimToken }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || data.error) {
        setClaimMessage(data.error || "Legacy data could not be claimed.");
        return;
      }
      setClaimMessage("Legacy data claimed. Reload the dashboard to use it.");
      await load();
    } catch {
      setClaimMessage("Legacy data could not be claimed.");
    } finally {
      setClaiming(false);
    }
  };

  const geminiSecret = secrets.find((item) => item.provider === "gemini" && item.keyName === "api_key");
  const crmSecret = secrets.find((item) => item.provider === "crm" && item.keyName === "webhook_secret");
  const exotelSecret = (keyName: string) =>
    secrets.find((item) => item.provider === "exotel" && item.keyName === keyName);
  const exotelAccountSecret = exotelSecret("account_sid");
  const exotelApiKeySecret = exotelSecret("api_key");
  const exotelApiTokenSecret = exotelSecret("api_token");
  const exotelAppIdSecret = exotelSecret("app_id");
  const exotelAccountReady = Boolean(
    exotelAccountSecret && exotelApiKeySecret && exotelApiTokenSecret,
  );
  const hasLegacyMembership = tenants.some((item) => item.isLegacy);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading workspace and providers…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Notice tone="warn">{error}</Notice>}
      {notice && !error && <Notice tone="ok">{notice}</Notice>}

      {/* Workspace */}
      <Section
        icon={Building2}
        title="Workspace"
        description="Your account is isolated to this workspace. Only you (and later, invited teammates) can see its data."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{role}</Badge>
          {tenant?.isLegacy && <Badge variant="secondary">Legacy workspace</Badge>}
          <span className="text-xs text-slate-500">Slug: {tenant?.slug || "—"}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            maxLength={120}
            disabled={!canManage}
          />
          <Button
            onClick={saveWorkspace}
            disabled={!canManage || savingWorkspace || !workspaceName.trim() || workspaceName.trim() === tenant?.name}
            className="gap-2 sm:w-auto"
          >
            {savingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
        {!canManage && (
          <p className="text-xs text-slate-500">Only owners and admins can change workspace settings.</p>
        )}
      </Section>

      {/* Gemini */}
      <Section
        icon={Sparkles}
        title="Gemini"
        description="Your workspace uses its own Gemini API key. It is encrypted at rest and never shown again after saving."
      >
        {geminiSecret ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
              Configured {geminiSecret.maskedSuffix ? `(${geminiSecret.maskedSuffix})` : ""}
            </span>
            <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600" onClick={() => removeSecret("gemini", "api_key")}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        ) : (
          <Notice tone="warn">
            No Gemini key yet. Calls and knowledge search stay unavailable until you add one.
          </Notice>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            value={geminiKey}
            onChange={(event) => setGeminiKey(event.target.value)}
            placeholder="Paste your Gemini API key"
            autoComplete="off"
            disabled={!canManage}
          />
          <Button
            onClick={saveGeminiKey}
            disabled={!canManage || savingGemini || !geminiKey.trim()}
            className="gap-2 sm:w-auto"
          >
            {savingGemini ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {geminiSecret ? "Replace key" : "Save key"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { key: SETTING.textModel, label: "Text model", value: models.text, placeholder: "gemini-flash-lite-latest" },
            { key: SETTING.liveModel, label: "Live model", value: models.live, placeholder: "gemini-3.8-live" },
            { key: SETTING.embeddingModel, label: "Embedding model", value: models.embedding, placeholder: "gemini-embedding-2" },
          ].map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">{field.label}</label>
              <div className="flex gap-2">
                <Input
                  value={field.value}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const value = event.target.value;
                    setModels((prev) => ({
                      ...prev,
                      [field.key === SETTING.textModel
                        ? "text"
                        : field.key === SETTING.liveModel
                          ? "live"
                          : "embedding"]: value,
                    }));
                  }}
                  disabled={!canManage}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => saveModel(field.key, field.value)}
                  disabled={!canManage || savingModels}
                  aria-label={`Save ${field.label}`}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">Leave blank to use the default.</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CRM */}
      <Section
        icon={Webhook}
        title="CRM / webhook"
        description="Send completed calls and bookings to your own automation. Failures never interrupt a live call."
      >
        <div className="flex flex-wrap gap-2">
          {(["none", "webhook"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={!canManage}
              onClick={() => setCrmProvider(option)}
              className={cn(
                "min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60",
                crmProvider === option
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {option === "none" ? "No CRM" : "Webhook"}
            </button>
          ))}
        </div>

        {crmProvider === "webhook" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Webhook URL</label>
              <Input
                value={crmWebhookUrl}
                onChange={(event) => setCrmWebhookUrl(event.target.value)}
                placeholder="https://your-endpoint.example/hooks/keralai"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                Signing secret {crmSecret ? `(configured${crmSecret.maskedSuffix ? ` ${crmSecret.maskedSuffix}` : ""})` : "(optional)"}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="password"
                  value={crmSecretInput}
                  onChange={(event) => setCrmSecretInput(event.target.value)}
                  placeholder="Shared secret for X-KeralAI-Signature"
                  autoComplete="off"
                  disabled={!canManage}
                />
                {crmSecret && (
                  <Button variant="ghost" className="gap-1.5" onClick={() => removeSecret("crm", "webhook_secret")} disabled={!canManage}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <Button onClick={saveCrm} disabled={!canManage || savingCrm} className="gap-2">
          {savingCrm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save CRM settings
        </Button>
      </Section>

      {/* Exotel account */}
      <Section
        icon={Phone}
        title="Exotel account (bring your own number)"
        description="Add your own Exotel API credentials. They are encrypted per workspace and used only for your account — never a shared platform account or server environment variable."
      >
        <div className="flex flex-wrap items-center gap-2">
          {exotelAccountReady ? (
            <Badge variant="default">Account configured</Badge>
          ) : (
            <Badge variant="secondary">Not configured</Badge>
          )}
          <span className="text-xs text-slate-500">
            Region:{" "}
            {exotelSubdomain === "api.in.exotel.com"
              ? "Mumbai (api.in.exotel.com)"
              : "Singapore (api.exotel.com)"}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          In the Exotel dashboard go to <span className="font-medium">Settings → API Settings</span> and copy
          your Account SID, API key and API token. Every tester can create their own Exotel account, which
          gives them their own trial number isolated from every other workspace.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <SecretField
            label="Account SID"
            placeholder="Your Exotel Account SID"
            value={exotelForm.accountSid}
            onChange={(value) => setExotelForm((prev) => ({ ...prev, accountSid: value }))}
            configured={exotelAccountSecret}
            disabled={!canManage}
            onRemove={() => removeSecret("exotel", "account_sid")}
          />
          <SecretField
            label="API key"
            placeholder="Your Exotel API key"
            value={exotelForm.apiKey}
            onChange={(value) => setExotelForm((prev) => ({ ...prev, apiKey: value }))}
            configured={exotelApiKeySecret}
            disabled={!canManage}
            onRemove={() => removeSecret("exotel", "api_key")}
          />
          <SecretField
            label="API token"
            placeholder="Your Exotel API token"
            value={exotelForm.apiToken}
            onChange={(value) => setExotelForm((prev) => ({ ...prev, apiToken: value }))}
            configured={exotelApiTokenSecret}
            disabled={!canManage}
            onRemove={() => removeSecret("exotel", "api_token")}
          />
          <SecretField
            label="App ID (optional)"
            placeholder="Exotel Voicebot app id"
            value={exotelForm.appId}
            onChange={(value) => setExotelForm((prev) => ({ ...prev, appId: value }))}
            configured={exotelAppIdSecret}
            disabled={!canManage}
            onRemove={() => removeSecret("exotel", "app_id")}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Region</label>
            <select
              value={exotelSubdomain}
              onChange={(event) => setExotelSubdomain(event.target.value)}
              disabled={!canManage}
              className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {EXOTEL_SUBDOMAIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Your ExoPhone number (optional)</label>
            <Input
              value={exotelPhone}
              onChange={(event) => setExotelPhone(event.target.value)}
              placeholder="+91…"
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={saveExotelAccount}
            disabled={!canManage || savingExotelAccount}
            className="gap-2"
          >
            {savingExotelAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Exotel account
          </Button>
          <Button
            variant="outline"
            onClick={verifyExotelAccount}
            disabled={!canManage || verifyingExotel || !exotelAccountReady}
            className="gap-2"
          >
            {verifyingExotel ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Test connection
          </Button>
        </div>
        {exotelVerify && <Notice tone={exotelVerify.ok ? "ok" : "warn"}>{exotelVerify.message}</Notice>}
      </Section>

      {/* Exotel routing */}
      <Section
        icon={PhoneOutgoing}
        title="Phone number routing (Exotel)"
        description="Point your Exotel Voicebot applet at this workspace's WebSocket URL so calls to your number reach your assistant. The token is shown only once, when rotated."
      >
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="font-medium text-slate-700">Status:</span>
            {exotel?.credential.configured ? (
              <Badge variant="default">
                Configured {exotel.credential.tokenLast4 ? `(…${exotel.credential.tokenLast4})` : ""}
              </Badge>
            ) : (
              <Badge variant="secondary">No token yet</Badge>
            )}
            {exotel?.credential.rotatedAt && (
              <span className="text-xs text-slate-400">
                Rotated {new Date(exotel.credential.rotatedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Recommended URL (Basic auth — survives Exotel query handling)
            </p>
            <p className="break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
              {exotel?.wsUrl ?? "wss://tenant:REPLACE_ME@your-bridge-host/ws/exotel/<slug>"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Alternative (query token)</p>
            <p className="break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
              {exotel?.wsUrlQuery ?? "wss://your-bridge-host/ws/exotel/<slug>?token=REPLACE_ME"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={rotateExotel} disabled={!canManage || rotating} className="gap-2">
            {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {exotel?.credential.configured ? "Rotate token" : "Generate token"}
          </Button>
          {freshExotel?.wsUrl && (
            <Button variant="outline" className="gap-2" onClick={() => copy(freshExotel.wsUrl)}>
              <Copy className="h-4 w-4" /> Copy new URL
            </Button>
          )}
        </div>

        {freshExotel?.wsUrl && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-sm font-semibold text-emerald-800">
              Copy the recommended URL into your Exotel applet now. It won&apos;t be shown again.
            </p>
            <p className="break-all font-mono text-xs text-emerald-900">{freshExotel.wsUrl}</p>
            {freshExotel.wsUrlQuery && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-700">
                  If your Exotel applet rejects Basic auth, use this query-token URL instead:
                </p>
                <p className="break-all font-mono text-xs text-emerald-800">
                  {freshExotel.wsUrlQuery}
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Legacy claim */}
      {canManage && (
        <Section
          icon={ShieldCheck}
          title="Legacy data"
          description="If this account is the original installation owner, you can claim the pre-existing data once."
        >
          {hasLegacyMembership ? (
            <Notice tone="ok">This account already has access to the legacy workspace.</Notice>
          ) : (
            <div className="space-y-3">
              <Input
                type="password"
                value={claimToken}
                placeholder="Claim token"
                autoComplete="off"
                onChange={(event) => setClaimToken(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={claimLegacy}
                  disabled={claiming || !claimToken.trim()}
                >
                  {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Claim legacy data
                </Button>
                <span className="text-xs text-slate-500">
                  Requires the owner email and the server claim token.
                </span>
              </div>
            </div>
          )}
          {claimMessage && (
            <Notice tone={claimMessage.includes("claimed") ? "ok" : "warn"}>{claimMessage}</Notice>
          )}
        </Section>
      )}

      <p className="flex items-center gap-1.5 pb-2 text-xs text-slate-400">
        <Globe className="h-3.5 w-3.5" /> Provider credentials are encrypted per workspace and never returned to the browser.
      </p>
    </div>
  );
}

/**
 * Provider settings: workspace, Gemini models/key, CRM webhook, Exotel account
 * credentials, Exotel routing, and the one-time legacy-data claim. All tenant
 * resolution happens server-side.
 */
export default ProviderSettings;