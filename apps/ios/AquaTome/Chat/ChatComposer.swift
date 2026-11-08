import Handbook
import SwiftUI

/// The chat's box, at the foot of the screen: the question being written, up to five lines then scrolling inside; over
/// it, what stops a question from going (the day used, chat off, signed out) or "Chưa có mạng"; under it, while a first
/// question is written, where questions go, then "Thường dưới nửa phút." while one waits, and from 450 characters its
/// length against the limit.
struct ChatComposer: View {
  @Bindable var model: ChatModel
  var typing: FocusState<Bool>.Binding
  let signedOut: Bool
  /// An answer landed below while the reader was up the thread.
  let newBelow: Bool
  let toNew: () -> Void
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var length: Int { model.draft.utf16.count }
  private var over: Bool { length > model.maxChars }
  private var canSend: Bool {
    !model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.answering && !over && !model.pathOffline && !signedOut
  }

  var body: some View {
    VStack(spacing: 8) {
      above
      HStack(alignment: .bottom, spacing: 6) {
        TextField(placeholder, text: $model.draft, axis: .vertical)
          .lineLimit(1...5)
          .focused(typing)
          .padding(.vertical, 8)
          .accessibilityIdentifier("chat-box")
        // The same place, size and colour: until the text begins, the question being answered can be stopped.
        if model.stoppable {
          Button(action: model.stopAsking) {
            Image(systemName: "stop.circle.fill").font(.title).symbolRenderingMode(.hierarchical)
          }
          .disabled(model.stopping)
          .accessibilityLabel(Text("Dừng"))
          .accessibilityIdentifier("chat-stop")
          .transition(.scale(scale: 0.8).combined(with: .opacity))
        } else {
          Button(action: send) {
            Image(systemName: "arrow.up.circle.fill").font(.title).symbolRenderingMode(.hierarchical)
          }
          .disabled(!canSend)
          .accessibilityLabel(Text("Gửi"))
          .accessibilityIdentifier("chat-send")
          .transition(.scale(scale: 0.8).combined(with: .opacity))
        }
      }
      .padding(.leading, 14)
      .padding(.trailing, 4)
      .padding(.vertical, 2)
      .background(.fill.tertiary, in: .rect(cornerRadius: 20))
      .animation(reduceMotion ? nil : .smooth(duration: 0.2), value: model.stoppable)
      under
    }
    .padding(.horizontal)
    .padding(.top, 8)
    .padding(.bottom, 6)
    .background(.bar)
  }

  private func send() {
    model.send()
    // The reader is about to read: a kept keyboard would hide most of the answer.
    typing.wrappedValue = false
  }

  /// At the largest text sizes, one that fits a line.
  private var placeholder: String {
    let s = model.route.subject
    if size.isAccessibilitySize || s.fromPhoto {
      return s.plant ? String(localized: "Hỏi về cây này…") : String(localized: "Hỏi về cá này…")
    }
    return String(localized: "Hỏi về \(ChatNames.inSentence(s.name))…")
  }

  @ViewBuilder private var above: some View {
    if let stop = model.stop {
      StopCard(stop: stop, question: model.draft) { openScreen(.search($0)) }.transition(.opacity)
    } else if signedOut && !model.thread.isEmpty {
      ChatSignIn().transition(.opacity)
    } else if model.offline {
      Pill(text: Text("Chưa có mạng"), icon: "wifi.slash").accessibilityIdentifier("chat-offline")
    } else if newBelow {
      Button(action: toNew) { Pill(text: Text("Câu trả lời mới ↓"), icon: nil) }.buttonStyle(.plain).accessibilityIdentifier("chat-new-below")
    }
  }

  private var under: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      if over {
        Text("Câu hỏi đã quá \(model.maxChars.formatted(.number.locale(.app))) ký tự. Rút gọn rồi gửi nhé.")
          .foregroundStyle(.red)
      } else if model.stopped != nil {
        Text("Đã dừng. Câu này không bị tính.").accessibilityIdentifier("chat-stopped-note")
      } else if model.answering, model.thread.last?.reply.writing == false {
        Text("Thường dưới nửa phút.")
      } else if model.thread.isEmpty {
        Text("AquaTome gửi câu hỏi tới Claude và lưu đến khi bạn xóa tài khoản.")
      }
      Spacer(minLength: 0)
      if length >= model.maxChars - 50 {
        Text(verbatim: "\(length)/\(model.maxChars)").monospacedDigit().foregroundStyle(over ? Color.red : Color.secondary).accessibilityIdentifier("chat-length")
      }
    }
    .font(.footnote)
    .foregroundStyle(.secondary)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A name inside a sentence: the empty screen's question, a starter, the box's placeholder.
enum ChatNames {
  /// Its first letter small ("Cá neon xanh" → "cá neon xanh"), unless the word is all capitals.
  static func inSentence(_ name: String) -> String {
    guard let first = name.first, name.dropFirst().first?.isUppercase != true else { return name }
    return first.lowercased() + name.dropFirst()
  }
}

/// A pill over the box.
private struct Pill: View {
  let text: Text
  let icon: String?
  var body: some View {
    HStack(spacing: 6) {
      if let icon { Image(systemName: icon) }
      text
    }
    .font(.footnote.weight(.semibold))
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(.regularMaterial, in: .capsule)
  }
}

/// Why a question can't go now, over the box: when it can again, whether it counted, and the handbook instead.
private struct StopCard: View {
  let stop: ChatModel.Stop
  let question: String
  let search: (String) -> Void

  var body: some View {
    let reset = StopCard.when(Chat.dayResets(after: .now))
    ChatCard(icon: "hourglass", title: title) {
      switch stop {
      case .rate: Text("Hỏi tiếp được từ \(reset).")
      case .busy: Text("Câu này chưa được tính. Hỏi lại được từ \(reset).")
      default: Text("Câu này chưa được tính.")
      }
    } action: {
      Button("Tìm trong cẩm nang") { search(question) }.accessibilityIdentifier("chat-search")
    }
    .accessibilityIdentifier("chat-stopped")
  }

  private var title: Text {
    switch stop {
    case .rate(let limit?): Text("Hết \(limit) câu hỏi hôm nay")
    case .rate(nil): Text("Hết lượt hỏi hôm nay")
    case .busy: Text("AquaTome đã hết lượt hỏi hôm nay")
    default: Text("Lúc này chưa hỏi được")
    }
  }

  /// When the day starts again, as the reader's clock reads it: "7:00 sáng mai", or "sáng nay" before it.
  static func when(_ reset: Date, now: Date = .now) -> String {
    let time = reset.formatted(date: .omitted, time: .shortened)
    let today = Calendar.current.isDate(reset, inSameDayAs: now)
    let morning = Calendar.current.component(.hour, from: reset) < 11
    return switch (today, morning) {
    case (true, true): String(localized: "\(time) sáng nay")
    case (false, true): String(localized: "\(time) sáng mai")
    case (true, false): String(localized: "\(time) hôm nay")
    case (false, false): String(localized: "\(time) ngày mai")
    }
  }
}

/// The chat's entry under a fish's or plant's facts: "Hỏi về cá neon xanh", answered from the handbook.
struct AskEntry: View {
  let route: ChatRoute

  var body: some View {
    NavigationLink(value: route) {
      HStack(spacing: 12) {
        Image(systemName: "bubble.left.and.text.bubble.right.fill").font(.title3).foregroundStyle(.tint).accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text("Hỏi về \(ChatNames.inSentence(route.subject.name))").font(.body.weight(.semibold)).foregroundStyle(.tint)
          Text("Trả lời dựa trên cẩm nang AquaTome").font(.footnote).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.fill.quaternary, in: .rect(cornerRadius: 12))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat-entry")
  }
}
