/** Server authority comes only from the configured user-ID allowlist. */
export function isPlatformAdminUserId(userId: string): boolean {
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean).includes(userId);
}
