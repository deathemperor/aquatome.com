import Foundation
import Testing
@testable import Handbook

// The owner's report of 14 Nov (Khám phá's loach list: a kuhli's middle with no head or tail, and "Cá bám đá Schistura
// spilota" over "Schistura spilota") as a check over every list the app draws, read from the app's own code: a card's
// photo is drawn by the frame rule (V2Photo with its box), and a list's second line is a scientific name its name doesn't
// already hold. A list added later that draws its photo or its second line its own way fails here.

@Test func aSecondLineIsTheScientificNameOnlyWhereTheNameLacksIt() {
  #expect(HandbookIndex.Item.line(under: "Cá bám đá Schistura spilota", "Schistura spilota") == nil)
  #expect(HandbookIndex.Item.line(under: "Cá kuhli Pangio cuneovirgata", "Pangio cuneovirgata") == nil)
  #expect(HandbookIndex.Item.line(under: "cá kuhli pangio cuneovirgata", "Pangio cuneovirgata") == nil)
  #expect(HandbookIndex.Item.line(under: "Cá heo sọc đen", "Ambastaia nigrolineata") == "Ambastaia nigrolineata")
  // A name holding the genus alone still wants the whole name under it.
  #expect(HandbookIndex.Item.line(under: "Cá bám đá leonardi", "Pseudohomaloptera leonardi") == "Pseudohomaloptera leonardi")
  // The Design Lead's (14 Nov): the genus alone, and a name short of the whole scientific name, keep it.
  #expect(HandbookIndex.Item.line(under: "Cá betta", "Betta splendens") == "Betta splendens")
  #expect(HandbookIndex.Item.line(under: "Cá betta channoides", "Betta cf. channoides") == "Betta cf. channoides")
  #expect(HandbookIndex.Item.line(under: "Cá neon", nil) == nil && HandbookIndex.Item.line(under: "Cá neon", "") == nil)
}

/// The app's Swift files, by their path under apps/ios/AquaTome, each as its lines.
private func appCode() throws -> [(file: String, lines: [Substring])] {
  var root = URL(fileURLWithPath: #filePath)
  for _ in 0..<4 { root.deleteLastPathComponent() }
  root.appendPathComponent("AquaTome")
  let files = try #require(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
  return try files.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }.map { url in
    (String(url.path.dropFirst(root.path.count + 1)), try String(contentsOf: url, encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: false))
  }.sorted { $0.file < $1.file }
}

/// Each line matching `pattern`, as "file: line", outside comments.
private func found(_ pattern: String, in code: [(file: String, lines: [Substring])], except: Set<String> = []) throws -> [String] {
  let re = try Regex(pattern)
  return code.flatMap { f in
    f.lines.compactMap { line -> String? in
      let text = line.trimmingCharacters(in: .whitespaces)
      guard !text.hasPrefix("//"), !text.hasPrefix("///"), !except.contains(f.file), line.contains(re) else { return nil }
      return "\(f.file): \(text)"
    }
  }
}

@Test func everyListsPhotoIsDrawnByTheFrameRule() throws {
  let code = try appCode()
  #expect(code.count > 50, "the app's code wasn't found")
  // AsyncImage draws a photo cut to its frame, wherever the fish is: none, but the chat's about card ("Về: …"), which
  // the iOS Content Lead moves to V2Photo with the chat cards (#766, 17 Nov).
  #expect(try found(#"AsyncImage\("#, in: code, except: ["Chat/ChatView.swift"]) == [])
  // V2Photo without its box crops centred: none, but the guide navigator's marks (three 26-pt squares of a part's
  // pictures, overlapping, not a page's photo).
  #expect(try found(#"V2Photo\(src:(?!.*box:)"#, in: code, except: ["Handbook/PageNavigator.swift"]) == [])
  // PageImage draws a photo at a ratio it's given: a page's photos at their own, YouTube's thumbnail at its 16:9, the
  // viewer's strip, v1's page head. A list's photo isn't one of them: draw it by V2Photo with its box.
  let pictures = try found(#"PageImage\(src:"#, in: code).map { $0.prefix { $0 != ":" } }
  #expect(pictures.sorted() == ["Handbook/NativePage.swift", "Handbook/NativePage.swift", "Handbook/PagePlayer.swift",
                                "Handbook/PhotoGrid.swift", "Handbook/PhotoViewer.swift", "V2/WholePage.swift"],
          "a new PageImage: a list's photo is drawn by V2Photo with its box")
}

@Test func noListPrintsAScientificNameItsNameHolds() throws {
  // A page's scientific name printed as it comes (`x.sub`), not through `subUnderName` or `HandbookIndex.Item.line(under:)`:
  // under a name like "Cá bám đá Schistura spilota" it says it twice. The owner's dashboard's `sub` is another thing.
  let raw = #"(let \w+ = [\w.?]+\.sub\b(?! ==))|(Text\((verbatim: )?[\w.?]+\.sub\b)|(\.sub \?\?)|(\?\? [\w.]+\.sub\b)|(LatinName\(text: [\w.]+\.sub\b)"#
  #expect(try found(raw, in: try appCode().filter { !$0.file.hasPrefix("Owner/") }) == [])
}
