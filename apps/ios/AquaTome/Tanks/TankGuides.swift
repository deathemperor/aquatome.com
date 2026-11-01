import Handbook
import SwiftUI
import Tanks

/// "Bài viết nhắc đến các loài trong bể": the handbook's guides that name the tank's fish and plants, video guides too,
/// without the shops' news (HandbookIndex.guides), the most of them first, each opening its page.
struct TankGuidesSection: View {
  let tank: Tank
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let guides = handbook.guides(about: tank.species.map(\.id) + tank.plants)
    if !guides.isEmpty {
      Section("Bài viết nhắc đến các loài trong bể") {
        ForEach(guides) { g in
          NavigationLink(value: g) { Text(g.name) }.accessibilityIdentifier("tank-guide")
        }
      }
    }
  }
}
