import Testing
@testable import Handbook

/// Whose photo a chip shows (`photoOf`): the member the site names (`imgOf`), found in this index, and only with a photo.
/// Anything else, none, and the chip shows its name alone (Design, 16 Nov).
@Test func aChipsPhotoIsTheMemberTheSiteNamesAndNoOtherOne() {
  let fish = ["a", "b", "c"].map { HandbookIndex.Item(kind: .fish, contentId: $0, name: "Cá \($0)", path: "/vi/ca/\($0)/") }
  let img = "https://media.aquatome.com/a/b-large.webp"
  let ix = HandbookIndex(lang: "vi", items: fish, home: .init(chips: [
    .init(id: "second", name: "second", order: 1, count: 2, members: ["a", "b"], img: img, imgOf: "b"),
    .init(id: "no-photo", name: "no-photo", order: 2, count: 2, members: ["a", "b"], imgOf: "a"),
    .init(id: "unnamed", name: "unnamed", order: 3, count: 2, members: ["a", "b"], img: img),
    .init(id: "not-a-member", name: "not-a-member", order: 4, count: 2, members: ["a", "b"], img: img, imgOf: "c"),
    .init(id: "not-here", name: "not-here", order: 5, count: 2, members: ["a", "gone"], img: img, imgOf: "gone"),
  ]))
  let shown = HandbookShelves(ix).chips.map { "\($0.id): \($0.photoOf?.contentId ?? "none")" }
  #expect(shown == ["second: b", "no-photo: none", "unnamed: none", "not-a-member: none", "not-here: none"])
}
