import Chihiros
@preconcurrency import CoreBluetooth
import Foundation
import WeekAqua

public enum BluetoothError: Error, Equatable {
  /// The user said no to Bluetooth for this app (or, on a Mac, for the terminal running it).
  case unauthorized
  case poweredOff
  case unsupported
  case timeout
  /// The light isn't in range any more (or was never seen by this scan).
  case notFound
  case disconnected
  /// Connected, but the light has no Nordic UART service: not a light this app can drive.
  case noUART
  case failed(String)
  /// Another connection attempt, or another step on this link, is under way.
  case busy
  /// A Week Aqua light of a model code this app can't drive yet (it speaks another protocol): never connected to.
  case notSupported
  /// Connected, but the Week Aqua light has no `fff2` under `fff0` to write to.
  case noWeekAquaService
}

/// A light seen while scanning. `id` is CoreBluetooth's per-phone identifier, not the light's address.
public struct FoundLight: Sendable, Hashable, Identifiable {
  public let id: UUID
  public let name: String
  public let rssi: Int
  /// What it advertised as its manufacturer data: a Week Aqua light's model code and address are there.
  public let manufacturerData: [UInt8]?
  public init(id: UUID, name: String, rssi: Int, manufacturerData: [UInt8]? = nil) {
    self.id = id; self.name = name; self.rssi = rssi; self.manufacturerData = manufacturerData
  }

  /// The Week Aqua light this is, if it is one (supported or not).
  public var weekAqua: WeekAquaAdvert? { WeekAquaAdvert.of(manufacturerData: manufacturerData, name: name) }
}

/// A connected light that can drop on its own.
@MainActor
protocol Droppable: AnyObject {
  func lost()
}

/// The phone's Bluetooth: scans for Chihiros lights (names starting with "DY") and Week Aqua lights (by their
/// manufacturer data or name), and connects to them.
/// Everything runs on the main actor; CoreBluetooth calls back on the main queue.
@MainActor
public final class Bluetooth: NSObject {
  private var central: CBCentralManager!
  private var stateWaiters: [CheckedContinuation<Void, Error>] = []
  private var stateRound = 0
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var scanSink: AsyncStream<FoundLight>.Continuation?
  private var connecting: (id: UUID, done: CheckedContinuation<Void, Error>)?
  private var attempt = 0
  private var links: [UUID: Droppable] = [:]

  public override init() {
    super.init()
    central = CBCentralManager(delegate: self, queue: nil)
  }

  /// Waits for Bluetooth to be on; throws if it is off, refused or missing. The first use shows the permission
  /// prompt, so the wait is long enough for someone to read it.
  public func ready(timeout: Duration = .seconds(60)) async throws {
    if let e = Self.error(for: central.state) { throw e }
    if central.state == .poweredOn { return }
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      stateWaiters.append(c)
      if stateWaiters.count == 1 {
        let round = stateRound
        Task { try? await Task.sleep(for: timeout); if self.stateRound == round { self.finishStateWait(BluetoothError.timeout) } }
      }
    }
  }

  /// Lights in range, each once, until `stopScan()`.
  public func scan() async throws -> AsyncStream<FoundLight> {
    try await ready()
    stopScan()
    let (stream, sink) = AsyncStream<FoundLight>.makeStream()
    scanSink = sink
    central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    return stream
  }

  public func stopScan() {
    if central.isScanning { central.stopScan() }
    scanSink?.finish()
    scanSink = nil
  }

  /// Connects and sets up the light's UART (notifications on), ready for frames.
  public func connect(_ light: FoundLight, timeout: Duration = .seconds(15)) async throws -> BLELink {
    try await open(light, timeout: timeout, make: { BLELink(peripheral: $0, name: light.name, central: self) },
                   start: { try await $0.start(timeout: timeout) })
  }

  /// Connects to a Week Aqua light of model code 5746 and finds its `fff2`, the one characteristic frames go to. A light
  /// of another code (or none it said) is never connected to.
  public func connectWeekAqua(_ light: FoundLight, timeout: Duration = .seconds(15)) async throws -> WeekAquaBLELink {
    guard let advert = light.weekAqua, advert.isSupported else { throw BluetoothError.notSupported }
    return try await open(light, timeout: timeout, make: { WeekAquaBLELink(peripheral: $0, name: light.name, advert: advert, central: self) },
                          start: { try await $0.start(timeout: timeout) })
  }

  /// Connects to `light`, then sets up the link `make` builds for it (`start`); on any failure, lets it go.
  private func open<Link: Droppable>(_ light: FoundLight, timeout: Duration, make: (CBPeripheral) -> Link,
                                     start: @MainActor (Link) async throws -> Void) async throws -> Link {
    // One connection attempt at a time (a double tap would otherwise strand the first caller).
    guard connecting == nil else { throw BluetoothError.busy }
    try await ready()
    guard connecting == nil else { throw BluetoothError.busy }
    guard let p = peripherals[light.id] ?? central.retrievePeripherals(withIdentifiers: [light.id]).first else { throw BluetoothError.notFound }
    peripherals[light.id] = p
    stopScan()
    let link = make(p)
    links[light.id] = link
    do {
      attempt += 1
      let n = attempt
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
        connecting = (light.id, c)
        central.connect(p)
        Task { try? await Task.sleep(for: timeout); if self.attempt == n { self.finishConnect(light.id, BluetoothError.timeout) } }
      }
      try await start(link)
      return link
    } catch {
      links[light.id] = nil
      central.cancelPeripheralConnection(p)
      throw error
    }
  }

  func cancel(_ p: CBPeripheral) { central.cancelPeripheralConnection(p) }

  private func finishStateWait(_ error: Error?) {
    let waiters = stateWaiters
    stateWaiters = []
    stateRound += 1
    for c in waiters { if let error { c.resume(throwing: error) } else { c.resume() } }
  }

  private func finishConnect(_ id: UUID, _ error: Error?) {
    guard let (cid, c) = connecting, cid == id else { return }
    connecting = nil
    if let error { c.resume(throwing: error) } else { c.resume() }
  }

  private static func error(for state: CBManagerState) -> BluetoothError? {
    switch state {
    case .unauthorized: .unauthorized
    case .poweredOff: .poweredOff
    case .unsupported: .unsupported
    default: nil
    }
  }
}

extension Bluetooth: @preconcurrency CBCentralManagerDelegate {
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn { finishStateWait(nil) } else if let e = Self.error(for: central.state) { finishStateWait(e) }
  }

  public func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? p.name ?? ""
    let data = (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data).map { [UInt8]($0) }
    let light = FoundLight(id: p.identifier, name: name, rssi: rssi.intValue, manufacturerData: data)
    guard name.hasPrefix(Chihiros.namePrefix) || light.weekAqua != nil else { return }
    peripherals[p.identifier] = p
    scanSink?.yield(light)
  }

  public func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
    finishConnect(p.identifier, nil)
  }

  public func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    finishConnect(p.identifier, BluetoothError.failed(error?.localizedDescription ?? "connect failed"))
  }

  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    finishConnect(p.identifier, BluetoothError.disconnected)
    links.removeValue(forKey: p.identifier)?.lost()
  }
}

/// One connected light's UART: frames go to the write characteristic as acknowledged writes; notifications come back
/// on `replies`.
@MainActor
public final class BLELink: NSObject, LightLink, Droppable {
  public let name: String
  public let replies: AsyncStream<[UInt8]>
  /// Called once if the light drops the connection (out of range, switched off, another phone took it).
  public var onDisconnect: (() -> Void)?
  public private(set) var isConnected = true

  private let peripheral: CBPeripheral
  private weak var central: Bluetooth?
  private let sink: AsyncStream<[UInt8]>.Continuation
  private var tx: CBCharacteristic?
  private var step: CheckedContinuation<Void, Error>?
  private var stepNumber = 0
  private let uart = CBUUID(string: UART.service)
  private let writeUUID = CBUUID(string: UART.write)
  private let notifyUUID = CBUUID(string: UART.notify)

  init(peripheral: CBPeripheral, name: String, central: Bluetooth) {
    self.peripheral = peripheral
    self.name = name
    self.central = central
    (replies, sink) = AsyncStream<[UInt8]>.makeStream()
    super.init()
    peripheral.delegate = self
  }

  /// Services → characteristics → notifications on.
  func start(timeout: Duration) async throws {
    try await run(timeout) { self.peripheral.discoverServices([self.uart]) }
  }

  public func write(_ frame: [UInt8]) async throws {
    guard isConnected, let tx else { throw BluetoothError.disconnected }
    if tx.properties.contains(.write) {
      try await run(.seconds(5)) { self.peripheral.writeValue(Data(frame), for: tx, type: .withResponse) }
    } else {
      peripheral.writeValue(Data(frame), for: tx, type: .withoutResponse)
    }
  }

  public func disconnect() { central?.cancel(peripheral) }

  func lost() {
    guard isConnected else { return }
    isConnected = false
    finish(BluetoothError.disconnected)
    sink.finish()
    onDisconnect?()
  }

  /// One step at a time: start it, then wait for its delegate callback (or the timeout).
  private func run(_ timeout: Duration, _ begin: @escaping () -> Void) async throws {
    guard step == nil else { throw BluetoothError.busy }
    stepNumber += 1
    let n = stepNumber
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      step = c
      begin()
      // Only this step's timeout: a later step has its own.
      Task { try? await Task.sleep(for: timeout); if self.stepNumber == n { self.finish(BluetoothError.timeout) } }
    }
  }

  private func finish(_ error: Error?) {
    guard let c = step else { return }
    step = nil
    if let error { c.resume(throwing: error) } else { c.resume() }
  }
}

extension BLELink: @preconcurrency CBPeripheralDelegate {
  public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil, let s = p.services?.first(where: { $0.uuid == uart }) else { return finish(error ?? BluetoothError.noUART) }
    p.discoverCharacteristics([writeUUID, notifyUUID], for: s)
  }

  public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    let tx = s.characteristics?.first { $0.uuid == writeUUID }
    guard error == nil, let tx, let rx = s.characteristics?.first(where: { $0.uuid == notifyUUID }) else {
      return finish(error ?? BluetoothError.noUART)
    }
    self.tx = tx
    p.setNotifyValue(true, for: rx)
  }

  public func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
    finish(error)
  }

  public func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
    if error == nil, c.uuid == notifyUUID, let v = c.value { sink.yield([UInt8](v)) }
  }

  public func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
    finish(error)
  }
}

/// One connected Week Aqua light: frames go to its `fff2`, written without response; it never answers. Only `fff0` is
/// looked for, and only the characteristic `WeekAquaGATT.writeCharacteristic` picks there is kept, so nothing can reach
/// the firmware-update service.
@MainActor
public final class WeekAquaBLELink: NSObject, WeekAquaLink, Droppable {
  public let name: String
  public let advert: WeekAquaAdvert
  /// Called once if the light drops the connection (out of range, switched off, another phone took it).
  public var onDisconnect: (() -> Void)?
  public private(set) var isConnected = true

  private let peripheral: CBPeripheral
  private weak var central: Bluetooth?
  private var tx: CBCharacteristic?
  private var setup: CheckedContinuation<Void, Error>?
  /// A frame waiting for iOS to take writes without response again.
  private var ready: CheckedContinuation<Void, Error>?
  private var readyRound = 0

  init(peripheral: CBPeripheral, name: String, advert: WeekAquaAdvert, central: Bluetooth) {
    self.peripheral = peripheral
    self.name = name
    self.advert = advert
    self.central = central
    super.init()
    peripheral.delegate = self
  }

  /// `fff0` → its `fff2`, ready for frames.
  func start(timeout: Duration) async throws {
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      setup = c
      peripheral.discoverServices(WeekAquaGATT.servicesToDiscover.map { CBUUID(string: $0) })
      Task { try? await Task.sleep(for: timeout); self.finish(BluetoothError.timeout) }
    }
  }

  /// One frame, without response. While iOS can't take one (its queue is full, or the link has only just opened), it
  /// waits for iOS to say it can, up to `readyTimeout`; written then, rather than dropped unseen.
  public func send(_ frame: [UInt8]) async throws {
    guard isConnected, let tx else { throw BluetoothError.disconnected }
    if !peripheral.canSendWriteWithoutResponse { try await waitUntilReady() }
    guard isConnected else { throw BluetoothError.disconnected }
    peripheral.writeValue(Data(frame), for: tx, type: .withoutResponse)
  }

  /// How long a frame waits for iOS to take writes again before it is given up.
  public static let readyTimeout: Duration = .seconds(1)

  /// Let go: no frame is sent after this, even before iOS reports the link closed.
  public func disconnect() {
    isConnected = false
    finish(BluetoothError.disconnected)
    finishReady(BluetoothError.disconnected)
    central?.cancel(peripheral)
  }

  func lost() {
    guard isConnected else { return }
    isConnected = false
    finish(BluetoothError.disconnected)
    finishReady(BluetoothError.disconnected)
    onDisconnect?()
  }

  private func waitUntilReady() async throws {
    readyRound += 1
    let n = readyRound
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      ready = c
      Task { try? await Task.sleep(for: Self.readyTimeout); if self.readyRound == n { self.finishReady(BluetoothError.busy) } }
    }
  }

  private func finishReady(_ error: Error?) {
    guard let c = ready else { return }
    ready = nil
    if let error { c.resume(throwing: error) } else { c.resume() }
  }

  private func finish(_ error: Error?) {
    guard let c = setup else { return }
    setup = nil
    if let error { c.resume(throwing: error) } else { c.resume() }
  }
}

extension WeekAquaBLELink: @preconcurrency CBPeripheralDelegate {
  public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil, let s = p.services?.first(where: { $0.uuid == CBUUID(string: WeekAquaGATT.service) }) else {
      return finish(error ?? BluetoothError.noWeekAquaService)
    }
    p.discoverCharacteristics([CBUUID(string: WeekAquaGATT.write)], for: s)
  }

  public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    let found = s.characteristics ?? []
    guard error == nil,
          let pick = WeekAquaGATT.writeCharacteristic(service: s.uuid.uuidString, characteristics: found.map(\.uuid.uuidString)),
          let tx = found.first(where: { $0.uuid.uuidString == pick }), tx.properties.contains(.writeWithoutResponse) else {
      return finish(error ?? BluetoothError.noWeekAquaService)
    }
    self.tx = tx
    finish(nil)
  }

  public func peripheralIsReady(toSendWriteWithoutResponse p: CBPeripheral) {
    finishReady(nil)
  }
}
