import SwiftUI
import UIKit

/// An icon the reader can give the app: the default (the round fish with leaf fins), or one of the alternates, all drawn
/// by scripts/app-icons.py but the AT (the default until 2026-11-04).
struct AppIconChoice: Identifiable {
  /// The alternate's name in the app (`AppIcon-…`), nil for the default.
  let alternate: String?
  let name: LocalizedStringKey
  var id: String { alternate ?? "AppIcon" }
  /// For the flows: `app-icon-bubs-pink`, `app-icon-default`.
  var testID: String { "app-icon-" + (alternate.map { String($0.dropFirst("AppIcon-".count)) } ?? "default") }
  /// The icon as the grid shows it: an icon set doesn't load as an image, so scripts/app-icons.py writes each at 64
  /// points too (AppIconPreview-…), the default's as well.
  var preview: UIImage? { UIImage(named: "AppIconPreview-" + testID.dropFirst("app-icon-".count)) }

  @MainActor static let groups: [(title: LocalizedStringKey, icons: [AppIconChoice])] = [
    ("Mặc định", [.init(alternate: nil, name: "AquaTome")]),
    ("Cá", [
      .init(alternate: "AppIcon-bubs-pink", name: "Cá tròn hồng"),
      .init(alternate: "AppIcon-bubs-aqua", name: "Cá tròn xanh ngọc"),
      .init(alternate: "AppIcon-bubs-sunrise", name: "Cá tròn bình minh"),
      .init(alternate: "AppIcon-pages-pink", name: "Cá vây sách"),
      .init(alternate: "AppIcon-lens-pink", name: "Cá kính lúp"),
      .init(alternate: "AppIcon-betta-grape", name: "Cá betta tím"),
      .init(alternate: "AppIcon-betta-reef", name: "Cá betta san hô"),
      .init(alternate: "AppIcon-betta-night", name: "Cá betta đêm"),
      .init(alternate: "AppIcon-puffer-lagoon", name: "Cá nóc xanh biển"),
      .init(alternate: "AppIcon-puffer-peach", name: "Cá nóc hồng đào"),
      .init(alternate: "AppIcon-puffer-lime", name: "Cá nóc xanh chanh"),
      .init(alternate: "AppIcon-clown-sky", name: "Cá hề xanh trời"),
      .init(alternate: "AppIcon-clown-aqua", name: "Cá hề xanh ngọc"),
      .init(alternate: "AppIcon-angel-night", name: "Cá ông tiên đêm"),
      .init(alternate: "AppIcon-angel-mint", name: "Cá ông tiên bạc hà"),
      .init(alternate: "AppIcon-neon-night", name: "Cá neon đêm"),
      .init(alternate: "AppIcon-neon-lime", name: "Cá neon xanh chanh"),
      .init(alternate: "AppIcon-discus-sunrise", name: "Cá đĩa bình minh"),
      .init(alternate: "AppIcon-discus-grape", name: "Cá đĩa tím"),
      .init(alternate: "AppIcon-guppy-pink", name: "Cá bảy màu hồng"),
      .init(alternate: "AppIcon-guppy-lagoon", name: "Cá bảy màu xanh biển"),
      .init(alternate: "AppIcon-goldfish-peach", name: "Cá ba đuôi hồng đào"),
      .init(alternate: "AppIcon-goldfish-sky", name: "Cá ba đuôi xanh trời"),
      .init(alternate: "AppIcon-koi-mint", name: "Cá koi bạc hà"),
      .init(alternate: "AppIcon-koi-reef", name: "Cá koi san hô"),
    ]),
    // Through the year. Chosen by hand: nothing switches them on its own.
    ("Theo mùa", [
      .init(alternate: "AppIcon-tet", name: "Tết"),
      .init(alternate: "AppIcon-valentine", name: "Valentine"),
      .init(alternate: "AppIcon-he", name: "Mùa hè"),
      .init(alternate: "AppIcon-trungthu", name: "Trung Thu"),
      .init(alternate: "AppIcon-halloween", name: "Halloween"),
      .init(alternate: "AppIcon-noel", name: "Giáng sinh"),
    ]),
    ("Thiết kế khác", [
      .init(alternate: "AppIcon-at", name: "Chữ AT"),
      .init(alternate: "AppIcon-at-water", name: "AT dưới nước"),
      .init(alternate: "AppIcon-book", name: "Sách và nước"),
      .init(alternate: "AppIcon-leaf-fish", name: "Cá lá"),
    ]),
  ]

  #if DEBUG
  /// For the flows: an icon listed here the app doesn't have, one it has that isn't listed (carried for nothing), or
  /// one with no preview to draw. Empty when all's well.
  @MainActor static var problems: [String] {
    let listed = Set(groups.flatMap(\.icons).compactMap(\.alternate))
    let icons = (Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any])?["CFBundleAlternateIcons"] as? [String: Any]
    let inApp = Set(icons.map { Array($0.keys) } ?? [])
    return (listed.subtracting(inApp).map { "not in the app: \($0)" } + inApp.subtracting(listed).map { "not offered: \($0)" }
      + groups.flatMap(\.icons).filter { $0.preview == nil }.map { "no image: \($0.id)" }).sorted()
  }
  #endif
}

/// The app's icon, as the reader chooses it: a grid of each icon under its name, the one in use ticked. iOS confirms a
/// change with its own alert.
struct AppIconPicker: View {
  @State private var current = UIApplication.shared.alternateIconName
  @State private var failed = false
  /// A change iOS hasn't confirmed yet: no second one meanwhile.
  @State private var changing = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        #if DEBUG
        if !AppIconChoice.problems.isEmpty {
          Text(verbatim: AppIconChoice.problems.joined(separator: "; ")).accessibilityIdentifier("app-icons-problems")
        }
        #endif
        ForEach(AppIconChoice.groups.indices, id: \.self) { g in
          VStack(alignment: .leading, spacing: 12) {
            Text(AppIconChoice.groups[g].title).font(.headline).accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 12, alignment: .top)], spacing: 18) {
              ForEach(AppIconChoice.groups[g].icons) { cell($0) }
            }
          }
        }
      }
      .padding()
    }
    .navigationTitle("Biểu tượng ứng dụng")
    .navigationBarTitleDisplayMode(.inline)
    .alert("Không đổi được biểu tượng. Thử lại sau.", isPresented: $failed) {}
    .onAppear { current = UIApplication.shared.alternateIconName }
  }

  private func cell(_ icon: AppIconChoice) -> some View {
    let chosen = current == icon.alternate
    return Button { choose(icon) } label: {
      VStack(spacing: 6) {
        Group {
          if let image = icon.preview { Image(uiImage: image).resizable() } else { Rectangle().fill(.fill.secondary) }
        }
        .frame(width: 64, height: 64)
        .clipShape(.rect(cornerRadius: 14.3, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
          if chosen {
            Image(systemName: "checkmark.circle.fill")
              .font(.title3)
              .symbolRenderingMode(.palette)
              .foregroundStyle(.white, Color.accentColor)
              .background(Circle().fill(.background).padding(-2))
              .offset(x: 6, y: 6)
          }
        }
        .padding(3)
        .overlay {
          RoundedRectangle(cornerRadius: 17, style: .continuous)
            .strokeBorder(chosen ? Color.accentColor : .clear, lineWidth: 2.5)
        }
        Text(icon.name).font(.caption2).multilineTextAlignment(.center).lineLimit(2).foregroundStyle(.primary)
      }
      .frame(maxWidth: .infinity)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(icon.name))
    .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    .accessibilityIdentifier(icon.testID)
  }

  private func choose(_ icon: AppIconChoice) {
    guard icon.alternate != current, !changing else { return }
    changing = true
    Task {
      defer { changing = false }
      do {
        try await UIApplication.shared.setAlternateIconName(icon.alternate)
        current = icon.alternate
      } catch {
        failed = true
      }
    }
  }
}

extension View {
  /// UI tests: `-app-icons` opens the picker over the app (AppIconFlowTests). Readers open it from its row in the Tài
  /// khoản sheet.
  func appIconsForTests() -> some View {
    #if DEBUG
    modifier(AppIconsForTests())
    #else
    self
    #endif
  }
}

#if DEBUG
private struct AppIconsForTests: ViewModifier {
  @State private var shown = ProcessInfo.processInfo.arguments.contains("-app-icons")
  func body(content: Content) -> some View {
    content.sheet(isPresented: $shown) { NavigationStack { AppIconPicker() }.ownerScreen("sheet app-icon") }
  }
}
#endif
