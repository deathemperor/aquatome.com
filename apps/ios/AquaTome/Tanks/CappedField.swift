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
    f.placeholder = String(localized: prompt ?? title)
    f.accessibilityLabel = String(localized: title)
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
    if f.text != text { f.text = text }
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
      let next = now.replacingCharacters(in: r, with: s)
      if next.unicodeScalars.count <= max { return true }
      // Typed past the end: nothing. Pasted: what fits of it.
      let fits = TankFields.capped(next, max)
      if fits != now {
        f.text = fits
        changed(f) // a text set here isn't an edit: the binding is told by hand
      }
      return false
    }

    @objc func changed(_ f: UITextField) {
      if f.markedTextRange == nil, let t = f.text, TankFields.capped(t, max) != t { f.text = TankFields.capped(t, max) }
      text.wrappedValue = f.text ?? ""
    }

    func textFieldShouldReturn(_ f: UITextField) -> Bool {
      f.resignFirstResponder()
      return true
    }
  }
}
