import { HttpError } from '@/lib/auth/context';
export class ProviderError extends HttpError {
  constructor(public code: string, public uncertain = false, public providerStatus?: number) {
    super(503, 'Phone service is temporarily unavailable. Please try again shortly.');
  }
}
