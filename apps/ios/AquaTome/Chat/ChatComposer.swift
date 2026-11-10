import Handbook
import SwiftUI

/// The chat's box, at the foot of the screen: the question being written, up to five lines then scrolling inside; over
/// it, what stops a question from going (the day used, chat off, signed out) or "Chưa có mạng"; under it, while a first
/// question is written, where questions go, then "Thường mất chưa tới nửa phút." while one waits. From 150 short of the
/// limit, the question's length over the send button, as Messages does.
struct ChatComposer: View {
  @Bindable var model: ChatModel
  var typing: FocusState<Bool>.Binding
  let signedOut: Bool
  /// An answer landed below while the reader was up the thread.
  let newBelow: Bool
  /// The reader is in earlier turns, the newest question below the box: a small round ↓ brings the end back.
  let farUp: Bool
  let toNew: () -> Void
  let toEnd: () -> Void
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// As the reader sees characters, after trimming: as the Worker counts them.
  private var length: Int { model.draft.trimmingCharacters(in: .whitespacesAndNewlines).count }
  @ScaledMetric(relativeTo: .caption2) private var countSize = 11.0
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
          .padding(.vertical, 7)
          .accessibilityIdentifier("chat-box")
        VStack(spacing: 2) {
          // Stacked: four digits don't fit over the button on one line ("1.432" over "/1.500").
          if length >= model.maxChars - 150 {
            VStack(spacing: 0) {
              Text(verbatim: length.formatted(.number.locale(.app)))
              Text(verbatim: "/" + model.maxChars.formatted(.number.locale(.app)))
            }
            .font(.system(size: max(11, countSize)).monospacedDigit())
            .foregroundStyle(over ? Color.red : Color.secondary)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: "\(length.formatted(.number.locale(.app)))/\(model.maxChars.formatted(.number.locale(.app)))"))
            .accessibilityIdentifier("chat-length")
          }
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
      }
      .padding(.leading, 16)
      .padding(.trailing, 6)
      .padding(.vertical, 6)
      .frame(minHeight: 48)
      .background(.regularMaterial, in: .rect(cornerRadius: 24))
      .overlay { RoundedRectangle(cornerRadius: 24).strokeBorder(Color.chatHairline, lineWidth: 0.5) }
      .animation(reduceMotion ? nil : .smooth(duration: 0.2), value: model.stoppable)
      under
    }
    .padding(.horizontal, 12)
    .padding(.top, 10)
    .padding(.bottom, 6)
    // The thread fades into the page's colour behind the box, with no edge.
    .background {
      LinearGradient(stops: [.init(color: Self.ground.opacity(0), location: 0), .init(color: Self.ground, location: 0.28)], startPoint: .top, endPoint: .bottom)
        .ignoresSafeArea(edges: .bottom)
    }
  }

  private static let ground = Color(uiColor: .systemGroupedBackground)

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
    } else if farUp {
      Button(action: toEnd) {
        Image(systemName: "arrow.down")
          .font(.system(size: size.isAccessibilitySize ? 24 : 15, weight: .semibold))
          .frame(width: size.isAccessibilitySize ? 60 : 40, height: size.isAccessibilitySize ? 60 : 40)
          .background { RoundGlass() }
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("Xuống cuối cuộc trò chuyện"))
      .accessibilityIdentifier("chat-to-end")
      .transition(.opacity)
    }
  }

  private var under: some View {
    // A view of no height when there's nothing to say, so the box doesn't move as the line comes and goes.
    ZStack {
      Color.clear.frame(height: 0)
      if over {
        Text("Câu hỏi đã quá \(model.maxChars.formatted(.number.locale(.app))) ký tự. Rút gọn rồi gửi nhé.")
          .foregroundStyle(.red)
      } else if model.stopped != nil {
        Text("Đã dừng. Câu này không bị tính.").accessibilityIdentifier("chat-stopped-note")
      } else if model.answering, model.thread.last?.reply.writing == false {
        Text("Thường mất chưa tới nửa phút.")
      } else if model.thread.isEmpty {
        Text("AquaTome gửi câu hỏi tới Claude và lưu đến khi bạn xóa tài khoản.")
      }
    }
    .font(.caption)
    .foregroundStyle(.secondary)
    .multilineTextAlignment(.center)
    // Whole, at the largest text with the keyboard up too.
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity)
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

/// The round ↓'s glass: the page blurred under 78% of the bar's colour, a hairline ring and a soft shadow.
private struct RoundGlass: View {
  private static let tint = Color(uiColor: UIColor {
    $0.userInterfaceStyle == .dark ? UIColor(red: 44 / 255, green: 44 / 255, blue: 46 / 255, alpha: 0.78) : UIColor(white: 1, alpha: 0.78)
  })

  var body: some View {
    ZStack {
      // The shadow drawn from a smaller circle: SwiftUI's has no spread.
      Circle().inset(by: 4).fill(.black.opacity(0.2)).blur(radius: 6).offset(y: 4)
      Circle().fill(.ultraThinMaterial)
      Circle().fill(Self.tint)
      Circle().strokeBorder(Color.chatHairline, lineWidth: 0.5)
    }
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
      case .busy: Text("Câu này không bị tính. Hỏi lại được từ \(reset).")
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
    case .busy: Text("AquaTome đã hết lượt hỏi Claude hôm nay")
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
  /// On the colour under v2's photo: its line in the white the words around it have.
  var onColour = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    VStack(spacing: 8) {
      NavigationLink(value: route) {
        HStack(spacing: 8) {
          Image(systemName: "bubble.left.and.text.bubble.right.fill").accessibilityHidden(true)
          Text("Hỏi về \(ChatNames.inSentence(route.subject.name))").multilineTextAlignment(.center)
        }
        .font(.body.weight(.semibold))
        .foregroundStyle(scheme == .dark ? Color(red: 0, green: 0x24 / 255, blue: 0x1B / 255) : Color.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 50)
        // The asset, not `.tint`: `.tint` keeps the phone's scheme under a page's colour, dark words on dark green.
        .background(Color("AccentColor"), in: .capsule)
        .contentShape(.capsule)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("chat-entry")
      Text("Trả lời dựa trên cẩm nang AquaTome").font(.footnote)
        .foregroundStyle(onColour ? AnyShapeStyle(.white.opacity(0.75)) : AnyShapeStyle(.secondary)).multilineTextAlignment(.center)
    }
  }
}
