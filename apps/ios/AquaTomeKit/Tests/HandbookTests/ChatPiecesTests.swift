import Foundation
import Testing
@testable import Handbook

/// A streaming answer's pieces fade in on their own; the words already there stay at full opacity, and done changes
/// nothing.
struct ChatPiecesTests {
  let t0 = Date(timeIntervalSinceReferenceDate: 0)
  typealias Run = Chat.Pieces.Run

  /// The same words, each run's opacity within a hair (time sums aren't exact in binary).
  private func same(_ a: [[Run]], _ b: [[Run]]) -> Bool {
    a.count == b.count && zip(a, b).allSatisfy { x, y in
      x.count == y.count && zip(x, y).allSatisfy { $0.words == $1.words && abs($0.opacity - $1.opacity) < 1e-9 }
    }
  }

  private func runs(_ p: Chat.Pieces, _ text: String, at s: Double) -> [[Run]] {
    let parts = Chat.paragraphs(text).flatMap { p -> [String] in
      switch p {
      case .text(let s): [s]
      case .list(let items): items.map(\.text)
      }
    }
    return p.runs(of: parts, in: text, at: t0.addingTimeInterval(s))
  }

  @Test func aPieceFadesInAndTheWordsBeforeItStayWhole() {
    var p = Chat.Pieces()
    p.changed(from: "", to: "Cá neon xa", at: t0, fading: true)
    p.changed(from: "Cá neon xa", to: "Cá neon xanh dễ nuôi", at: t0.addingTimeInterval(0.1), fading: true)
    // The first piece two-thirds in, the second (which starts mid-word, drawn as is) just come.
    #expect(same(runs(p, "Cá neon xanh dễ nuôi", at: 0.1), [[Run("Cá neon xa", 0.1 / 0.15), Run("nh dễ nuôi", 0)]]), "\(runs(p, "Cá neon xanh dễ nuôi", at: 0.1))")
    // The first's fade over: whole; the second halfway.
    #expect(same(runs(p, "Cá neon xanh dễ nuôi", at: 0.175), [[Run("Cá neon xa"), Run("nh dễ nuôi", 0.5)]]), "\(runs(p, "Cá neon xanh dễ nuôi", at: 0.175))")
    #expect(same(runs(p, "Cá neon xanh dễ nuôi", at: 0.25), [[Run("Cá neon xanh dễ nuôi")]]), "\(runs(p, "Cá neon xanh dễ nuôi", at: 0.25))")
    p.settle(at: t0.addingTimeInterval(0.25))
    #expect(p.isEmpty)
  }

  @Test func doneWithTheSameTextChangesNothing() {
    var p = Chat.Pieces()
    p.changed(from: "Cá neon", to: "Cá neon xanh", at: t0, fading: true)
    let before = runs(p, "Cá neon xanh", at: 0.05)
    // Done: the same text, no longer fading. The fade under way goes on.
    p.changed(from: "Cá neon xanh", to: "Cá neon xanh", at: t0.addingTimeInterval(0.05), fading: false)
    #expect(runs(p, "Cá neon xanh", at: 0.05) == before)
    #expect(same(before, [[Run("Cá neon"), Run(" xanh", 0.05 / 0.15)]]), "\(before)")
  }

  @Test func textReplacedOrDrawnAtOnceFadesNothing() {
    var p = Chat.Pieces()
    p.changed(from: "Cá neon", to: "Cá neon xanh", at: t0, fading: true)
    p.changed(from: "Cá neon xanh", to: "Neon xanh", at: t0.addingTimeInterval(0.01), fading: true)
    #expect(p.isEmpty)
    p.changed(from: "", to: "Neon xanh dễ nuôi", at: t0, fading: false)
    #expect(p.isEmpty)
    #expect(same(runs(p, "Neon xanh dễ nuôi", at: 0), [[Run("Neon xanh dễ nuôi")]]), "\(runs(p, "Neon xanh dễ nuôi", at: 0))")
  }

  @Test func aPieceAcrossAParagraphAndStepsFallsInPlace() {
    let before = "Neon ưa nước mềm.\nNhiệt độ 22–26 °C."
    let text = before + "\n\n1. Thay 30% nước\n  2. Đo pH"
    var p = Chat.Pieces()
    p.changed(from: "Neon ưa", to: before, at: t0.addingTimeInterval(-1), fading: true)
    p.changed(from: before, to: text, at: t0, fading: true)
    // The paragraph keeps its line break; the steps lose their numbers and spaces, as paragraphs gives them, and the
    // piece covers both.
    #expect(same(runs(p, text, at: 0.03), [[Run(before)], [Run("Thay 30% nước", 0.2)], [Run("Đo pH", 0.2)]]), "\(runs(p, text, at: 0.03))")
  }

  @Test func piecesCutInsideALetterOrAnEmojiKeepEachPieceWhole() {
    // "ế" as e + two marks, the marks in the next piece; an emoji, two UTF-16 units, whole in its own.
    let a = "Nuôi d\u{0065}", b = "\u{0302}\u{0301} 🐟", text = a + b
    var p = Chat.Pieces()
    p.changed(from: "", to: a, at: t0.addingTimeInterval(-1), fading: true)
    p.changed(from: a, to: text, at: t0, fading: true)
    #expect(same(runs(p, text, at: 0.075), [[Run(a), Run(b, 0.5)]]), "\(runs(p, text, at: 0.075))")
  }
}
