// Demo build stand-in for the browser-extension bridge: the offline demo has
// no Lawcovery Case Capture extension, so eCourts actions fail fast and clearly.
export function extensionRequest() {
  return Promise.reject(new Error("eCourts capture needs the Lawcovery browser extension and is not available in this demo."));
}
