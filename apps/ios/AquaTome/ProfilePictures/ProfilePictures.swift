import AccountSync
import SwiftUI

/// A picture a signed-in reader may take for their account, as the App Store's account photo: real photos of well-known
/// fish and a crayfish, a spread of groups, each sharp at a small round size and free of any credit line (public domain
/// or CC0 on Wikimedia Commons, each checked). In the app (Assets.xcassets/ProfilePictures, 300-pixel squares), so they
/// show offline and at once. The set is `protocols/profile-pictures.json`'s, by its ids; only the chosen one's id is kept.
struct ProfilePicture: Identifiable, Hashable {
  /// The fish's content id: the set's id, and the fish's page in any language (`HandbookModel.page`).
  let id: String
  /// What names it while the handbook hasn't its page: its scientific name, or the trade name of a fish without one.
  let fallback: String

  var image: Image { Image("profile-\(id)") }

  /// Its fish's name in the reader's language, without the English the page adds in brackets ("Cá betta Halfmoon", not
  /// "… (Halfmoon betta)"): under a small photo it doubled the lines.
  @MainActor func name(_ handbook: HandbookModel) -> String {
    let name = handbook.page(id)?.name ?? fallback
    return name.replacing(#/\s*\([^)]*\)$/#, with: "")
  }

  static let all: [ProfilePicture] = [
    .init(id: "halfmoon-betta", fallback: "Betta splendens"),
    .init(id: "corydoras-trilineatus", fallback: "Corydoras trilineatus"),
    .init(id: "maylandia-callainos", fallback: "Maylandia callainos"),
    .init(id: "dichotomyctere-nigroviridis", fallback: "Dichotomyctere nigroviridis"),
    .init(id: "blood-parrot-cichlid", fallback: "Blood parrot"),
    .init(id: "pterygoplichthys-joselimaianus", fallback: "Pterygoplichthys joselimaianus"),
    .init(id: "nannostomus-marginatus", fallback: "Nannostomus marginatus"),
    .init(id: "cyphotilapia-gibberosa", fallback: "Cyphotilapia gibberosa"),
    .init(id: "cambarellus-patzcuarensis", fallback: "Cambarellus patzcuarensis"),
    .init(id: "andinoacara-rivulatus", fallback: "Andinoacara rivulatus"),
    .init(id: "carnegiella-strigata", fallback: "Carnegiella strigata"),
    .init(id: "brachygobius-xanthozonus", fallback: "Brachygobius xanthozonus"),
    .init(id: "betta-tussyae", fallback: "Betta tussyae"),
    .init(id: "botia-kubotai", fallback: "Botia kubotai"),
    .init(id: "apistogramma-macmasteri", fallback: "Apistogramma macmasteri"),
    .init(id: "scatophagus-argus", fallback: "Scatophagus argus"),
    .init(id: "thorichthys-meeki", fallback: "Thorichthys meeki"),
    .init(id: "hyphessobrycon-erythrostigma", fallback: "Hyphessobrycon erythrostigma"),
  ]

  static func with(id: some StringProtocol) -> ProfilePicture? { all.first { $0.id == id } }
}

/// The account's picture as this phone keeps it, with the account it's for: "<account id> <picture id>" in
/// `account.picture`, so another account signed in on the phone starts with none, and signing out drops it
/// (`AccountPictureMark`). The account keeps it too (POST /api/v1/account/picture, protocols/accounts.openapi.json):
/// chosen, it's sent (AccountModel.sendPicture); signed in, the account's is taken, unless this phone's is still unsent.
enum AccountPicture {
  static let key = "account.picture"
  /// The account whose picture this phone chose and hasn't sent yet.
  static let unsent = "account.picture.unsent"
  /// Set once a phone has sent what it chose before the account kept pictures (the build before), so that one isn't
  /// taken for "none" from the account.
  static let carried = "account.picture.carried"

  static func chosen(_ stored: String, by user: AccountUser?) -> ProfilePicture? {
    let parts = stored.split(separator: " ", maxSplits: 1)
    guard let user, parts.count == 2, parts[0] == user.id else { return nil }
    return ProfilePicture.with(id: parts[1])
  }

  static func stored(_ picture: ProfilePicture, by user: AccountUser) -> String { "\(user.id) \(picture.id)" }
}

/// The account's picture where the account shows (ProfileButton, at 32 points; the Tài khoản sheet's card): its fish once
/// one's chosen, else `symbol`. Signing out drops the choice, so the next reader on the phone doesn't get it.
struct AccountPictureMark<Symbol: View>: View {
  var size: CGFloat = 32
  @ViewBuilder let symbol: Symbol
  @Environment(AccountModel.self) private var account
  @AppStorage(AccountPicture.key) private var stored = ""

  var body: some View {
    Group {
      if let picture = AccountPicture.chosen(stored, by: account.user) {
        picture.image.resizable().scaledToFill().frame(width: size, height: size).clipShape(.circle)
      } else {
        symbol
      }
    }
    // From the start too: a session that had ended before the app opened.
    .onChange(of: account.state == .signedOut, initial: true) { _, out in if out { stored = "" } }
  }
}

/// "Ảnh đại diện", in the account's section of the Tài khoản sheet (AccountSection), and the set to choose from. Its icon
/// is a tile either way: the card above it shows the fish chosen.
struct AccountPictureRow: View {
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @AppStorage(AccountPicture.key) private var stored = ""

  var body: some View {
    let picture = AccountPicture.chosen(stored, by: account.user)
    NavigationLink { ProfilePicturePicker().accountSheetDone() } label: {
      Label { Text("Ảnh đại diện") } icon: { Tile(symbol: "fish.fill", color: Tile.green) }
    }
    .accessibilityValue(Text(verbatim: picture?.name(handbook) ?? ""))
    .accessibilityIdentifier("account-picture")
  }
}

/// The set, as a grid of round photos with their fish's names, or at the accessibility text sizes a list (a photo beside
/// each name, which a grid's narrow columns broke mid-word): the chosen one ringed and ticked; "Bỏ ảnh" for none.
struct ProfilePicturePicker: View {
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @AppStorage(AccountPicture.key) private var stored = ""

  var body: some View {
    let chosen = AccountPicture.chosen(stored, by: account.user)
    let list = size.isAccessibilitySize
    ScrollView {
      LazyVGrid(columns: list ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: list ? 16 : 22) {
        ForEach(ProfilePicture.all) { picture in
          let on = chosen == picture
          Button {
            guard let user = account.user else { return }
            stored = AccountPicture.stored(picture, by: user)
            Task { await account.sendPicture(picture.id) }
          } label: {
            let layout = list ? AnyLayout(HStackLayout(spacing: 16)) : AnyLayout(VStackLayout(spacing: 8))
            layout {
              photo(picture, on: on)
              Text(verbatim: picture.name(handbook)).font(list ? .body : .caption).lineLimit(list ? nil : 2)
                .multilineTextAlignment(list ? .leading : .center).foregroundStyle(list ? .primary : .secondary)
              if list { Spacer(minLength: 0) }
            }
            // A row's photos in line whether its names take one line or two.
            .frame(maxHeight: .infinity, alignment: .top)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(on ? .isSelected : [])
          .accessibilityIdentifier("profile-picture-\(picture.id)")
        }
      }
      .padding(20)
    }
    .modifier(ClearUnderTopBar(shown: true))
    .navigationTitle("Ảnh đại diện")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if chosen != nil {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Bỏ ảnh") {
            stored = ""
            Task { await account.sendPicture(nil) }
          }
          .accessibilityIdentifier("profile-picture-none")
        }
      }
    }
  }

  /// The photo, ringed and ticked when chosen; the tick at one size, so the largest text doesn't cover the fish with it.
  private func photo(_ picture: ProfilePicture, on: Bool) -> some View {
    picture.image.resizable().scaledToFill()
      .frame(width: 84, height: 84)
      .clipShape(.circle)
      .padding(4)
      .overlay { Circle().strokeBorder(on ? Color.accentColor : .clear, lineWidth: 3) }
      .overlay(alignment: .bottomTrailing) {
        if on {
          Image(systemName: "checkmark.circle.fill").font(.system(size: 24)).symbolRenderingMode(.palette)
            .foregroundStyle(.white, Color.accentColor)
        }
      }
  }
}
