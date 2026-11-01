import Handbook
import SwiftUI
import Tanks

/// "Bài viết nhắc đến các loài trong bể": the handbook's guides that name the tank's fish and plants, without the shops'
/// news (HandbookIndex.guides), the most of them first, each opening its page; then, as a species page on the site does,
/// the video guides under "Có trong video hướng dẫn".
struct TankGuidesSection: View {
  let tank: Tank
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let guides = handbook.guides(about: tank.species.map(\.id) + tank.plants)
    if !guides.written.isEmpty {
      Section("Bài viết nhắc đến các loài trong bể") {
        ForEach(guides.written) { g in
          NavigationLink(value: g) { Text(g.name) }.accessibilityIdentifier("tank-guide")
        }
      }
    }
    if !guides.videos.isEmpty {
      Section("Có trong video hướng dẫn") {
        ForEach(guides.videos) { g in
          NavigationLink(value: g) { Text(g.name) }.accessibilityIdentifier("tank-video")
        }
      }
    }
  }
}
