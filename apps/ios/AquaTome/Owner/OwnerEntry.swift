import SwiftUI

/// "Bảng điều khiển": a row only for the owner's account, its own section under the account, with how many lines the
/// overview says need the owner (grey: they're the day's work, not a fault). One view, with `ownerDashboard()` on the navigation stack
/// it's in, to move with the account wherever the app shows it.
struct OwnerEntry: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    let owner = account.owner
    if owner.isOwner == true {
      Section {
        NavigationLink(value: OwnerRoute(key: "", anchor: nil)) {
          LabeledContent {
            if !owner.sessionEnded, let n = owner.dashboard?.needs.count, n > 0 {
              Text(n, format: .number)
                .font(.subheadline.monospacedDigit())
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(.quaternary, in: .capsule)
                .accessibilityLabel(Text("\(n) việc cần làm"))
            }
          } label: {
            Label {
              owner.sessionEnded
                ? Text("Bảng điều khiển") + Text(verbatim: "\n") + Text("Phiên đăng nhập đã hết: đăng nhập lại để xem bảng điều khiển.").font(.subheadline).foregroundStyle(.red)
                : Text("Bảng điều khiển")
            } icon: {
              Tile(symbol: "chart.bar.xaxis", color: Tile.green)
            }
          }
        }
        .accessibilityIdentifier("owner-dashboard")
      }
    }
  }
}

/// A screen of the dashboard: a section by its key (at a heading's anchor), or the overview ("").
struct OwnerRoute: Hashable {
  let key: String
  let anchor: String?
}

extension View {
  /// On the navigation stack that shows OwnerEntry: where the dashboard opens. Whether the row shows is checked app-wide
  /// (AquaTomeApp), whichever tab is open.
  func ownerDashboard() -> some View {
    navigationDestination(for: OwnerRoute.self) { OwnerScreen(key: $0.key, anchor: $0.anchor) }
      .navigationDestination(for: OwnerTableRoute.self) { OwnerTableScreen(route: $0) }
  }
}
