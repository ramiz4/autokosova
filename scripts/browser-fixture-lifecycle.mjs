/** A canceled browser request no longer has a fulfillable CDP interception ID.
 * Require a matching network cancellation or a replaced document, not just an error string.
 * Unknown protocol errors, timeouts and failures of live requests remain test failures.
 */
export function isCanceledFixtureResponse({ error, networkId, documentChanged }, canceledRequests) {
  return (
    ((typeof networkId === 'string' && canceledRequests.has(networkId)) ||
      documentChanged === true) &&
    error?.code === -32602 &&
    error?.message === 'Invalid InterceptionId.'
  );
}
