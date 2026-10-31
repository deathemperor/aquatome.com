import Chihiros
@preconcurrency import CoreBluetooth
import Foundation

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
}

/// A light seen while scanning. `id` is CoreBluetooth's per-phone identifier, not the light's address.
public struct FoundLight: Sendable, Hashable, Identifiable {
  public let id: UUID
  public let name: String
  public let rssi: Int
  public init(id: UUID, name: String, rssi: Int) { self.id = id; self.name = name; self.rssi = rssi }
}

/// The phone's Bluetooth: scans for Chihiros lights (names starting with "DY") and connects to them.
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
  private var links: [UUID: BLELink] = [:]

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
    // One connection attempt at a time (a double tap would otherwise strand the first caller).
    guard connecting == nil else { throw BluetoothError.busy }
    try await ready()
    guard connecting == nil else { throw BluetoothError.busy }
    guard let p = peripherals[light.id] ?? central.retrievePeripherals(withIdentifiers: [light.id]).first else { throw BluetoothError.notFound }
    peripherals[light.id] = p
    stopScan()
    let link = BLELink(peripheral: p, name: light.name, central: self)
    links[light.id] = link
    do {
      attempt += 1
      let n = attempt
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
        connecting = (light.id, c)
        central.connect(p)
        Task { try? await Task.sleep(for: timeout); if self.attempt == n { self.finishConnect(light.id, BluetoothError.timeout) } }
      }
      try await link.start(timeout: timeout)
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
    guard name.hasPrefix(Chihiros.namePrefix) else { return }
    peripherals[p.identifier] = p
    scanSink?.yield(FoundLight(id: p.identifier, name: name, rssi: rssi.intValue))
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
public final class BLELink: NSObject, LightLink {
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
