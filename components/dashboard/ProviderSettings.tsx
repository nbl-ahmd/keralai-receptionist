"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Copy,
  Globe,
  KeyRound,
  Phone,
  PhoneOutgoing,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Segmented } from "@/components/ui/segmented";
import { SettingsSection } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

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
  { value: "api.exotel.com", label: "Singapore" },
  { value: "api.in.exotel.com", label: "Mumbai" },
] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {configured && (
          <Badge variant="success" className="gap-1">
            <BadgeCheck className="h-3 w-3" aria-hidden />
            Configured{configured.maskedSuffix ? ` ${configured.maskedSuffix}` : ""}
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          placeholder={configured ? "Enter a new value to replace" : placeholder}
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
            title={`Remove ${label}`}
            className="shrink-0 text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Workspace + provider configuration: workspace name, Gemini key and models,
 * CRM webhook, Exotel account credentials and Exotel routing. Secrets are only
 * ever sent one way — the API returns masked suffixes, never values.
 */
export function ProviderSettings() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [freshExotel, setFreshExotel] = useState<{ token: string; wsUrl: string } | null>(null);

  const [exotelForm, setExotelForm] = useState({ accountSid: "", apiKey: "", apiToken: "", appId: "" });
  const [exotelSubdomain, setExotelSubdomain] = useState<string>("api.exotel.com");
  const [exotelPhone, setExotelPhone] = useState("");
  const [savingExotelAccount, setSavingExotelAccount] = useState(false);
  const [verifyingExotel, setVerifyingExotel] = useState(false);
  const [exotelVerify, setExotelVerify] = useState<{ ok: boolean; message: string } | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState("");

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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
          value[SETTING.exotelSubdomain] === "api.in.exotel.com" ? "api.in.exotel.com" : "api.exotel.com",
        );
        setExotelPhone(asString(value[SETTING.exotelPhoneNumber]));
      }
      setSecrets(Array.isArray(secretsRes?.secrets) ? secretsRes.secrets : []);
      setExotel(exotelRes?.error ? null : exotelRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      toast({ message: "Workspace name saved.", tone: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Failed to save workspace", tone: "error" });
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
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to save model");
      toast({ message: "Model setting saved.", tone: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Failed to save model", tone: "error" });
    } finally {
      setSavingModels(false);
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
    try {
      await saveSecret("gemini", "api_key", geminiKey.trim());
      setGeminiKey("");
      await load();
      toast({ message: "Gemini API key saved.", tone: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Failed to save Gemini key", tone: "error" });
    } finally {
      setSavingGemini(false);
    }
  };

  const removeSecret = (provider: string, keyName: string) => {
    const label = `${provider} ${keyName}`.replace(/_/g, " ");
    setConfirm({
      title: "Remove credential?",
      description: `Removing the ${label} credential will disable anything that depends on it until you add a new one.`,
      confirmLabel: "Remove credential",
      destructive: true,
      onConfirm: async () => {
        await deleteSecret(provider, keyName);
        await load();
        toast({ message: "Credential removed.", tone: "success" });
      },
    });
  };

  const saveCrm = async () => {
    setSavingCrm(true);
    try {
      await saveSetting(SETTING.crmProvider, crmProvider);
      if (crmProvider === "webhook" && crmWebhookUrl.trim()) {
        await saveSetting(SETTING.crmWebhookUrl, crmWebhookUrl.trim());
      }
      if (crmSecretInput.trim()) {
        await saveSecret("crm", "webhook_secret", crmSecretInput.trim());
        setCrmSecretInput("");
      }
      await load();
      toast({ message: "CRM settings saved.", tone: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Failed to save CRM settings", tone: "error" });
    } finally {
      setSavingCrm(false);
    }
  };

  const rotateExotel = () => {
    setConfirm({
      title: "Rotate routing token?",
      description:
        "Rotating immediately invalidates the current token. Calls using the old URL stop reaching your assistant until you update the Exotel applet.",
      confirmLabel: "Rotate token",
      destructive: true,
      onConfirm: async () => {
        setRotating(true);
        try {
          const response = await fetch("/api/tenant/exotel", { method: "POST" });
          const data = (await response.json()) as { error?: string; token?: string; wsUrl?: string };
          if (!response.ok || data.error || !data.token) {
            throw new Error(data.error || "Failed to rotate Exotel token");
          }
          setFreshExotel({ token: data.token, wsUrl: data.wsUrl ?? "" });
          await load();
          toast({
            message: "Token rotated — copy the new URL now, it is shown once.",
            tone: "warning",
          });
        } catch (err) {
          toast({ message: err instanceof Error ? err.message : "Failed to rotate token", tone: "error" });
          throw err;
        } finally {
          setRotating(false);
        }
      },
    });
  };

  const saveExotelAccount = async () => {
    setSavingExotelAccount(true);
    try {
      if (exotelForm.accountSid.trim()) await saveSecret("exotel", "account_sid", exotelForm.accountSid.trim());
      if (exotelForm.apiKey.trim()) await saveSecret("exotel", "api_key", exotelForm.apiKey.trim());
      if (exotelForm.apiToken.trim()) await saveSecret("exotel", "api_token", exotelForm.apiToken.trim());
      if (exotelForm.appId.trim()) await saveSecret("exotel", "app_id", exotelForm.appId.trim());
      await saveSetting(SETTING.exotelSubdomain, exotelSubdomain);
      await saveSetting(SETTING.exotelPhoneNumber, exotelPhone.trim() || null);
      setExotelForm({ accountSid: "", apiKey: "", apiToken: "", appId: "" });
      await load();
      toast({ message: "Exotel account saved.", tone: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Failed to save Exotel account", tone: "error" });
    } finally {
      setSavingExotelAccount(false);
    }
  };

  const verifyExotelAccount = async () => {
    setVerifyingExotel(true);
    setExotelVerify(null);
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
      toast({ message: "Copied to clipboard.", tone: "success" });
    } catch {
      toast({ message: "Could not copy. Select the text and copy it manually.", tone: "error" });
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
  const exotelAccountReady = Boolean(exotelAccountSecret && exotelApiKeySecret && exotelApiTokenSecret);
  const hasLegacyMembership = tenants.some((item) => item.isLegacy);

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
      setConfirm(null);
    } catch {
      // The action surfaces its own error toast.
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}

      {/* Workspace */}
      <SettingsSection
        icon={Building2}
        title="Workspace"
        description="Your account is isolated to this workspace. Only you — and later, invited teammates — can see its data."
        status={
          <>
            <Badge variant="outline" className="capitalize">{role}</Badge>
            {tenant?.isLegacy && <Badge variant="secondary">Legacy workspace</Badge>}
          </>
        }
      >
        <Field label="Workspace name" hint={tenant?.slug ? `Slug: ${tenant.slug}` : undefined}>
          {({ id, ...aria }) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={id}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                maxLength={120}
                disabled={!canManage}
                {...aria}
              />
              <Button
                onClick={saveWorkspace}
                disabled={!canManage || savingWorkspace || !workspaceName.trim() || workspaceName.trim() === tenant?.name}
                className="gap-2 sm:w-auto"
                loading={savingWorkspace}
              >
                {!savingWorkspace && <Save className="h-4 w-4" aria-hidden />}
                Save
              </Button>
            </div>
          )}
        </Field>
        {!canManage && (
          <p className="text-xs text-muted-foreground">Only owners and admins can change workspace settings.</p>
        )}
      </SettingsSection>

      {/* Gemini */}
      <SettingsSection
        icon={Sparkles}
        title="Gemini"
        description="Your workspace uses its own Gemini API key. It is encrypted at rest and never shown again after saving."
        status={
          geminiSecret ? (
            <Badge variant="success" className="gap-1">
              <BadgeCheck className="h-3 w-3" aria-hidden /> Configured
            </Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )
        }
      >
        {!geminiSecret && (
          <Notice tone="warning">
            No Gemini key yet. Calls and knowledge search stay unavailable until you add one.
          </Notice>
        )}

        {geminiSecret && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden />
              Configured{geminiSecret.maskedSuffix ? ` (${geminiSecret.maskedSuffix})` : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-red-600"
              onClick={() => removeSecret("gemini", "api_key")}
              disabled={!canManage}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          </div>
        )}

        <Field label="Gemini API key" hint="Paste a key from Google AI Studio. It is stored encrypted per workspace.">
          {({ id, ...aria }) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={id}
                type="password"
                value={geminiKey}
                onChange={(event) => setGeminiKey(event.target.value)}
                placeholder={geminiSecret ? "Enter a new key to replace" : "Paste your Gemini API key"}
                autoComplete="off"
                disabled={!canManage}
                {...aria}
              />
              <Button
                onClick={saveGeminiKey}
                disabled={!canManage || savingGemini || !geminiKey.trim()}
                className="gap-2 sm:w-auto"
                loading={savingGemini}
              >
                {!savingGemini && <KeyRound className="h-4 w-4" aria-hidden />}
                {geminiSecret ? "Replace key" : "Save key"}
              </Button>
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { key: SETTING.textModel, label: "Text model", field: "text" as const, value: models.text, placeholder: "gemini-flash-lite-latest" },
            { key: SETTING.liveModel, label: "Live model", field: "live" as const, value: models.live, placeholder: "gemini-3.8-live" },
            { key: SETTING.embeddingModel, label: "Embedding model", field: "embedding" as const, value: models.embedding, placeholder: "gemini-embedding-2" },
          ].map((item) => (
            <Field key={item.key} label={item.label} hint="Leave blank to use the default.">
              {({ id, ...aria }) => (
                <div className="flex gap-2">
                  <Input
                    id={id}
                    value={item.value}
                    placeholder={item.placeholder}
                    onChange={(event) =>
                      setModels((prev) => ({ ...prev, [item.field]: event.target.value }))
                    }
                    disabled={!canManage}
                    {...aria}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => saveModel(item.key, item.value)}
                    disabled={!canManage || savingModels}
                    aria-label={`Save ${item.label}`}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Field>
          ))}
        </div>
      </SettingsSection>

      {/* CRM */}
      <SettingsSection
        icon={Webhook}
        title="CRM / webhook"
        description="Send completed calls and bookings to your own automation. Failures never interrupt a live call."
      >
        <Segmented
          value={crmProvider}
          onValueChange={(value) => canManage && setCrmProvider(value)}
          disabled={!canManage}
          aria-label="CRM provider"
          className="max-w-xs"
          options={[
            { value: "none", label: "No CRM" },
            { value: "webhook", label: "Webhook" },
          ]}
        />

        {crmProvider === "webhook" && (
          <div className="space-y-4">
            <Field label="Webhook URL">
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  value={crmWebhookUrl}
                  onChange={(event) => setCrmWebhookUrl(event.target.value)}
                  placeholder="https://your-endpoint.example/hooks/keralai"
                  disabled={!canManage}
                  {...aria}
                />
              )}
            </Field>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  Signing secret <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                {crmSecret && (
                  <Badge variant="success" className="gap-1">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                    Configured{crmSecret.maskedSuffix ? ` ${crmSecret.maskedSuffix}` : ""}
                  </Badge>
                )}
              </div>
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
                  <Button
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground hover:text-red-600"
                    onClick={() => removeSecret("crm", "webhook_secret")}
                    disabled={!canManage}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <Button onClick={saveCrm} disabled={!canManage || savingCrm} className="gap-2" loading={savingCrm}>
          {!savingCrm && <Save className="h-4 w-4" aria-hidden />}
          Save CRM settings
        </Button>
      </SettingsSection>

      {/* Exotel account */}
      <SettingsSection
        icon={Phone}
        title="Exotel account"
        description="Add your own Exotel API credentials. They are encrypted per workspace and used only for your account — never a shared platform account or server environment variable."
        status={
          exotelAccountReady ? (
            <Badge variant="success">Account configured</Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )
        }
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          In the Exotel dashboard go to <span className="font-medium text-foreground">Settings → API Settings</span>{" "}
          and copy your Account SID, API key and API token. Each workspace uses its own Exotel account.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Region</p>
            <Segmented
              value={exotelSubdomain}
              onValueChange={(value) => canManage && setExotelSubdomain(value)}
              disabled={!canManage}
              aria-label="Exotel region"
              options={EXOTEL_SUBDOMAIN_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>
          <Field label="Your ExoPhone number" hint="Optional. Shown to callers when relevant.">
            {({ id, ...aria }) => (
              <Input
                id={id}
                value={exotelPhone}
                onChange={(event) => setExotelPhone(event.target.value)}
                placeholder="+91…"
                disabled={!canManage}
                {...aria}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveExotelAccount} disabled={!canManage || savingExotelAccount} className="gap-2" loading={savingExotelAccount}>
            {!savingExotelAccount && <Save className="h-4 w-4" aria-hidden />}
            Save Exotel account
          </Button>
          <Button
            variant="outline"
            onClick={verifyExotelAccount}
            disabled={!canManage || verifyingExotel || !exotelAccountReady}
            className="gap-2"
            loading={verifyingExotel}
          >
            {!verifyingExotel && <ShieldCheck className="h-4 w-4" aria-hidden />}
            Test connection
          </Button>
        </div>
        {exotelVerify && <Notice tone={exotelVerify.ok ? "success" : "error"}>{exotelVerify.message}</Notice>}
      </SettingsSection>

      {/* Exotel routing */}
      <SettingsSection
        icon={PhoneOutgoing}
        title="Phone number routing"
        description="Point your Exotel Voicebot applet at this workspace's WebSocket URL so calls to your number reach your assistant."
        status={
          exotel?.credential.configured ? (
            <Badge variant="success">
              Configured {exotel.credential.tokenLast4 ? `(…${exotel.credential.tokenLast4})` : ""}
            </Badge>
          ) : (
            <Badge variant="warning">No token yet</Badge>
          )
        }
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Your bridge URL (Basic auth)</p>
          <p className="break-all rounded-xl bg-surface-2 px-3.5 py-2.5 font-mono text-xs text-muted-foreground">
            {exotel?.wsUrl ?? "wss://tenant:REPLACE_ME@your-bridge-host/ws/exotel/<slug>"}
          </p>
          <p className="text-xs text-muted-foreground">
            Paste this into your Exotel Voicebot applet. The token is shown only once, when generated or rotated.
          </p>
          {exotel?.credential.rotatedAt && (
            <p className="text-xs text-muted-foreground">
              Last rotated {new Date(exotel.credential.rotatedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={rotateExotel} disabled={!canManage || rotating} className="gap-2" loading={rotating}>
            {!rotating && <RefreshCw className="h-4 w-4" aria-hidden />}
            {exotel?.credential.configured ? "Rotate token" : "Generate token"}
          </Button>
          {freshExotel?.wsUrl && (
            <Button variant="outline" className="gap-2" onClick={() => copy(freshExotel.wsUrl)}>
              <Copy className="h-4 w-4" aria-hidden /> Copy new URL
            </Button>
          )}
        </div>

        {freshExotel?.wsUrl && (
          <Notice tone="warning">
            <p className="font-semibold">Copy this URL into your Exotel applet now — it won&apos;t be shown again.</p>
            <p className="mt-1 break-all font-mono text-xs">{freshExotel.wsUrl}</p>
          </Notice>
        )}
      </SettingsSection>

      {/* Legacy claim */}
      {canManage && (
        <SettingsSection
          icon={ShieldCheck}
          title="Legacy data"
          description="If this account is the original installation owner, you can claim the pre-existing data once."
        >
          {hasLegacyMembership ? (
            <Notice tone="success">This account already has access to the legacy workspace.</Notice>
          ) : (
            <div className="space-y-3">
              <Field label="Claim token">
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    type="password"
                    value={claimToken}
                    placeholder="Claim token"
                    autoComplete="off"
                    onChange={(event) => setClaimToken(event.target.value)}
                    {...aria}
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={claimLegacy}
                  disabled={claiming || !claimToken.trim()}
                  loading={claiming}
                >
                  {!claiming && <ShieldCheck className="h-4 w-4" aria-hidden />}
                  Claim legacy data
                </Button>
                <span className="text-xs text-muted-foreground">Requires the owner email and the server claim token.</span>
              </div>
            </div>
          )}
          {claimMessage && (
            <Notice tone={claimMessage.includes("claimed") ? "success" : "error"}>{claimMessage}</Notice>
          )}
        </SettingsSection>
      )}

      <p className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5" aria-hidden /> Provider credentials are encrypted per workspace and never
        returned to the browser.
      </p>

      {/* Destructive confirmation */}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && !confirmBusy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={confirmBusy}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant={confirm?.destructive ? "destructive" : "default"}
              onClick={runConfirm}
              loading={confirmBusy}
              className="w-full sm:w-auto"
            >
              {confirm?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">This action takes effect immediately.</p>
      </Dialog>
    </div>
  );
}

export default ProviderSettings;
