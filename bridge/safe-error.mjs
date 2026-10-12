// SDK errors can contain request URLs, authorization headers and nested sockets.
// Log a bounded classification instead of serializing provider-controlled data.
export function safeError(error) {
  const status = Number(error?.status ?? error?.code);
  return {
    kind: error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'timeout' : 'operation_failed',
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? {status} : {}),
  };
}
