import SwiftUI
import UIKit

/// A one-line text field that never holds more than `max` characters (Unicode scalars, as the store counts them). What
/// would go past them is turned away where the keyboard edits the text, so the field always shows what's kept. Cut after
/// SwiftUI's TextField had taken the text, the field could go on showing up to 89 of 80 on a slow phone (#374, #398).
struct CappedField: UIViewRepresentable {
  /// What VoiceOver calls the field.
  let title: LocalizedStringResource
  /// Shown while it's empty; the title when there's none.
  var prompt: LocalizedStringResource?
  @Binding var text: String
  let max: Int
  /// The UI tests' name for it.
  let id: String
  /// No capitals or corrections: a scientific name.
  var plain = false

  func makeUIView(context: Context) -> UITextField {
    let f = UITextField()
    f.placeholder = String(localized: (prompt ?? title).inApp)
    f.accessibilityLabel = String(localized: title.inApp)
    f.accessibilityIdentifier = id
    f.font = .preferredFont(forTextStyle: .body)
    f.adjustsFontForContentSizeCategory = true
    f.setContentHuggingPriority(.defaultLow, for: .horizontal)
    f.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    if plain {
      f.autocapitalizationType = .none
      f.autocorrectionType = .no
    }
    f.returnKeyType = .done
    f.delegate = context.coordinator
    f.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
    f.text = text
    return f
  }

  func updateUIView(_ f: UITextField, context: Context) {
    // A form can hand over a new binding on each redraw (the plug form's outlets).
    context.coordinator.text = $text
    // Not while a word is being composed: the binding holds it cut, the field the whole of it until it's done.
    if f.markedTextRange == nil, f.text != text { f.text = text }
  }

  func makeCoordinator() -> Coordinator { Coordinator(text: $text, max: max) }

  @MainActor
  final class Coordinator: NSObject, UITextFieldDelegate {
    var text: Binding<String>
    let max: Int
    init(text: Binding<String>, max: Int) { self.text = text; self.max = max }

    func textField(_ f: UITextField, shouldChangeCharactersIn range: NSRange, replacementString s: String) -> Bool {
      // A word still being composed (a keyboard that builds letters) is cut once it's done (`changed`).
      if f.markedTextRange != nil { return true }
      let now = f.text ?? ""
      guard let r = Range(range, in: now) else { return false }
      if now.replacingCharacters(in: r, with: s).unicodeScalars.count <= max { return true }
      // Past the cap: what fits of the typed or pasted text goes in where it was put, as a web page's maxlength does;
      // the rest of the text stays.
      let room = Swift.max(0, max - (now.unicodeScalars.count - now[r].unicodeScalars.count))
      let part = String(String.UnicodeScalarView(s.unicodeScalars.prefix(room)))
      guard !part.isEmpty else { return false }
      f.text = now.replacingCharacters(in: r, with: part)
      if let end = f.position(from: f.beginningOfDocument, offset: range.location + (part as NSString).length) {
        f.selectedTextRange = f.textRange(from: end, to: end)
      }
      changed(f) // a text set here isn't an edit: the binding is told by hand
      return false
    }

    /// The binding never holds more than the cap, even while a word is being composed, so a save then can't send
    /// more; the field is cut once the word is done.
    @objc func changed(_ f: UITextField) {
      let t = f.text ?? ""
      if f.markedTextRange == nil, TankFields.capped(t, max) != t { f.text = TankFields.capped(t, max) }
      text.wrappedValue = TankFields.capped(f.text ?? "", max)
    }

    func textFieldShouldReturn(_ f: UITextField) -> Bool {
      f.resignFirstResponder()
      return true
    }
  }
}
