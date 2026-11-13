/// The fields a batch, an event and a diagnostics report may carry: the privacy policy's list. A field outside them
/// fails the field audit (TelemetryTests), and ContractTests checks they're the contract's.
enum Policy {
  static let batchFields: Set<String> = ["app", "os", "device", "lang", "session", "install", "events"]
  static let eventFields: Set<String> = ["t", "at", "path", "screen", "depth", "seconds", "shop", "href", "name", "ok", "kind"]
  static let diagnosticFields: Set<String> = ["kind", "app", "os", "device", "payload"]
}
