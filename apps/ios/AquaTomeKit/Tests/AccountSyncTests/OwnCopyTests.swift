import Testing
import AccountSync

// Which release builds are our own copies (the app's OwnCopy): their events, pages and clicks then carry
// `AccountsClient.ourCopy`, and the site leaves them out of its reader stats.

@Test("A TestFlight copy is ours by its receipt, the sandbox's, even when StoreKit gives no verified answer")
func aTestFlightCopyIsOurs() {
  #expect(AccountsClient.isOurCopy(receipt: "sandboxReceipt", storeKit: nil))
}

@Test("A copy from the App Store, its receipt the App Store's, is a reader's")
func anAppStoreCopyIsAReaders() {
  #expect(!AccountsClient.isOurCopy(receipt: "receipt", storeKit: "Production"))
  #expect(!AccountsClient.isOurCopy(receipt: nil, storeKit: nil))
}
