import Testing
@testable import Handbook

/// The fish pages that aren't fish (the owner's report of 15 Nov: the fiddler crab's page said "Hỏi về cá này"), by the
/// orders and groups the live Vietnamese index gave them that day.
private func page(_ name: String, group: String? = nil, tax: [String]?) -> HandbookIndex.Item {
  .init(kind: .fish, contentId: name, name: name, path: "/vi/ca/\(name)/", group: group, tax: tax)
}

@Test func aCrabAShrimpASnailAFrogANewtOrACoralIsntAFish() {
  #expect(!page("cua-dong-ho", group: "other", tax: ["Decapoda", "Ocypodidae", "Austruca"]).isFish)
  #expect(!page("ech-mong-vuot-lun", group: "other", tax: ["Anura", "Pipidae", "Hymenochirus"]).isFish)
  #expect(!page("sa-giong", group: "other", tax: ["Caudata", "Salamandridae", "Tylototriton"]).isFish)
  #expect(!page("san-ho-duncan", group: "other", tax: ["Scleractinia", "Dendrophylliidae", "Duncanopsammia"]).isFish)
  #expect(!page("oc-nerite", group: "snails", tax: ["Cycloneritida", "Neritidae", "Neritina"]).isFish)
  #expect(!page("dia-chau-a", group: "other", tax: ["Euhirudinea", "Hirudinidae", "Hirudinaria"]).isFish)
  // The shrimp and snail groups, whatever their order says, or with none (a bred form).
  #expect(!page("tep-blue-dream", group: "shrimp", tax: nil).isFish)
  #expect(!page("oc-tai", group: "snails", tax: [""]).isFish)
}

@Test func aFishIsAFish() {
  #expect(page("ca-neon", group: "tetras", tax: ["Characiformes", "Characidae", "Paracheirodon"]).isFish)
  #expect(page("ca-dia", group: "cichlids", tax: ["Cichliformes", "Cichlidae", "Symphysodon"]).isFish)
  #expect(page("ca-duoi", group: "other", tax: ["Myliobatiformes", "Potamotrygonidae", "Potamotrygon"]).isFish)
  // A bred form, with no order of its own: its group's, a fish's.
  #expect(page("ca-la-han", group: "cichlids", tax: [""]).isFish && page("ca-koi", group: "other", tax: nil).isFish)
  // A plant or a guide is no fish either.
  #expect(!HandbookIndex.Item(kind: .plant, name: "Rotala đỏ", path: "/vi/cay/rotala-do/").isFish)
}
