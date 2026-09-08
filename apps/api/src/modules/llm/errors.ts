export class LLMServiceError extends Error {
  /** HTTP status returned by the provider, if known — for server-side logging only, never forwarded verbatim to clients. */
  readonly providerStatus?: number;

  constructor(message: string, providerStatus?: number) {
    super(message);
    this.name = 'LLMServiceError';
    this.providerStatus = providerStatus;
  }
}
