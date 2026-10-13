"use client";
import { createContext, useContext } from 'react';

interface Access { userId: string; tenantId: string; isAdmin: boolean }
const AccessContext = createContext<Access | null>(null);
/** Navigation hint supplied by the authenticated layout; APIs recheck authority. */
export function WorkspaceAccessProvider({ value, children }: { value: Access; children: React.ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
export function useWorkspaceAccess() { return useContext(AccessContext); }
