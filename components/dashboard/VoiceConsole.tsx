"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

import LiveReceptionist from "@/components/LiveReceptionist";
import { useModal } from "@/components/ui/use-modal";
import type { Appointment, CompanyProfile } from "@/types";

interface VoiceConsoleProps {
  open: boolean;
  onClose: () => void;
  companyProfile: CompanyProfile;
  onBookAppointment: (appointment: Appointment) => void;
  autoConnect?: boolean;
  onAutoConnectHandled?: () => void;
}

/**
 * Full-screen container for the browser voice session. Uses the shared modal
 * behaviour (focus trap, Escape to close, scroll lock) and fills the viewport
 * on phones so the controls sit within thumb reach.
 */
export function VoiceConsole({
  open,
  onClose,
  companyProfile,
  onBookAppointment,
  autoConnect,
  onAutoConnectHandled,
}: VoiceConsoleProps) {
  const { containerRef, onKeyDown, close } = useModal(open, onClose);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Live voice session"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex h-app w-full flex-col overflow-hidden bg-background animate-fade-in sm:h-[min(92dvh,860px)] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-border sm:shadow-lg"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close live session"
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4"
        >
          <X className="h-5 w-5" />
        </button>

        <LiveReceptionist
          companyProfile={companyProfile}
          onBookAppointment={onBookAppointment}
          autoConnect={autoConnect}
          onAutoConnectHandled={onAutoConnectHandled}
          initialVoiceName={companyProfile.voiceName}
          initialPitch={companyProfile.voicePitch}
          initialSpeed={companyProfile.voiceSpeed}
        />
      </div>
    </div>,
    document.body,
  );
}

export default VoiceConsole;
