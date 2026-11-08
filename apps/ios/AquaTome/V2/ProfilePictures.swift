import SwiftUI

/// The fish a signed-in reader may take as their account's picture: real photos of well-known fish, a spread of groups,
/// each sharp at a small round size and free of any credit line (public domain or CC0 on Wikimedia Commons, checked one
/// by one), so none needs a line under it. Only the chosen one's id is kept. A prototype to show: kept on the phone for
/// now; the account would keep it once the server takes it.
struct ProfilePicture: Identifiable, Hashable {
  let id: String
  /// Its fish's page, for the fish's name in the reader's language.
  let path: String
  let src: String

  static let all: [ProfilePicture] = [
    .init(id: "halfmoon-betta", path: "/vi/ca/ca-betta-halfmoon/", src: "https://media.aquatome.com/commons/4bf56d15bcdacdd1-480.webp"),
    .init(id: "corydoras-trilineatus", path: "/vi/ca/ca-chuot-ba-soc/", src: "https://media.aquatome.com/commons/46588947d861dfce-480.webp"),
    .init(id: "maylandia-callainos", path: "/vi/ca/ca-cichlid-zebra-cobalt/", src: "https://media.aquatome.com/commons/f8d0b687908b2327-480.webp"),
    .init(id: "dichotomyctere-nigroviridis", path: "/vi/ca/ca-noc-xanh-dom/", src: "https://media.aquatome.com/commons/1275ad3e5b49f559-480.webp"),
    .init(id: "blood-parrot-cichlid", path: "/vi/ca/ca-hong-ket/", src: "https://media.aquatome.com/commons/a0d29f6fbdea344d-480.webp"),
    .init(id: "pterygoplichthys-joselimaianus", path: "/vi/ca/ca-lau-kieng-vay-buom-trang/", src: "https://media.aquatome.com/commons/c2c7d0ccc820afd9-480.webp"),
    .init(id: "nannostomus-marginatus", path: "/vi/ca/ca-chi-lun/", src: "https://media.aquatome.com/commons/1881b5ea5480ca6d-480.webp"),
    .init(id: "cyphotilapia-gibberosa", path: "/vi/ca/ca-cyphotilapia-gibberosa/", src: "https://media.aquatome.com/commons/34c6ff662dfec5d1-480.webp"),
    .init(id: "cambarellus-patzcuarensis", path: "/vi/ca/tom-cang-lun-mexico/", src: "https://media.aquatome.com/commons/9790659b2d234f0d-480.webp"),
    .init(id: "albino-oscar", path: "/vi/ca/ca-tai-tuong-albino/", src: "https://media.aquatome.com/commons/7be6e0d108401431-480.webp"),
    .init(id: "carnegiella-strigata", path: "/vi/ca/ca-riu-cam-thach/", src: "https://media.aquatome.com/commons/89b7fdbb26188428-480.webp"),
    .init(id: "brachygobius-xanthozonus", path: "/vi/ca/ca-bong-ong-xanthozonus/", src: "https://media.aquatome.com/commons/58fda37937215f3f-480.webp"),
    .init(id: "betta-tussyae", path: "/vi/ca/ca-betta-tussyae/", src: "https://media.aquatome.com/commons/69d21ef4d95211e5-480.webp"),
    .init(id: "botia-kubotai", path: "/vi/ca/ca-heo-cham-bi/", src: "https://media.aquatome.com/commons/34401fdec6e03865-480.webp"),
    .init(id: "apistogramma-macmasteri", path: "/vi/ca/ca-apisto-macmasteri/", src: "https://media.aquatome.com/commons/9e30e9c250900726-480.webp"),
    .init(id: "scatophagus-argus", path: "/vi/ca/ca-nhan/", src: "https://media.aquatome.com/commons/3d4bff35a1715c40-480.webp"),
    .init(id: "thorichthys-meeki", path: "/vi/ca/ca-cichlid-mieng-lua/", src: "https://media.aquatome.com/commons/384ebc03e62438cd-480.webp"),
    .init(id: "hyphessobrycon-erythrostigma", path: "/vi/ca/ca-tim-chay-mau/", src: "https://media.aquatome.com/commons/4483fcdb3de0e5fb-480.webp"),
  ]

  static func with(id: String?) -> ProfilePicture? { all.first { $0.id == id } }
}

/// The set as a grid of round photos with their fish's names; the chosen one ringed and ticked.
@available(iOS 18, *)
struct ProfilePicturePicker: View {
  @AppStorage("v2ProfilePicture") private var chosen = ""
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 22) {
          ForEach(ProfilePicture.all) { p in
            let on = chosen == p.id
            Button { chosen = p.id } label: {
              VStack(spacing: 8) {
                V2Photo(src: p.src)
                  .frame(width: 84, height: 84)
                  .clipShape(Circle())
                  .padding(4)
                  .overlay { Circle().strokeBorder(on ? Color.accentColor : .clear, lineWidth: 3) }
                  .overlay(alignment: .bottomTrailing) {
                    if on {
                      Image(systemName: "checkmark.circle.fill").font(.title2).symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.accentColor)
                    }
                  }
                Text(verbatim: handbook.item(at: p.path)?.name ?? "").font(.caption).lineLimit(2)
                  .multilineTextAlignment(.center).foregroundStyle(.v2Faint)
              }
              // A row's photos in line whether its names take one line or two.
              .frame(maxHeight: .infinity, alignment: .top)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
          }
        }
        .padding(20)
      }
      .navigationTitle("Ảnh đại diện")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Bỏ ảnh") { chosen = "" }.disabled(chosen.isEmpty) }
        ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } }
      }
    }
  }
}
