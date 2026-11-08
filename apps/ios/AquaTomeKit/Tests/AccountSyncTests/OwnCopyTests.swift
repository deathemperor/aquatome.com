import Testing
import AccountSync

// Which release builds are our own copies (the app's OwnCopy): their events, pages and clicks then carry
// `AccountsClient.ourCopy`, and the site leaves them out of its reader stats.

@Test("A TestFlight copy, its receipt the sandbox's, is ours")
func aTestFlightCopyIsOurs() {
  #expect(AccountsClient.isOurCopy(receipt: "sandboxReceipt"))
}

@Test("A copy from the App Store, its receipt the App Store's, is a reader's")
func anAppStoreCopyIsAReaders() {
  #expect(!AccountsClient.isOurCopy(receipt: "receipt"))
  #expect(!AccountsClient.isOurCopy(receipt: nil))
}
