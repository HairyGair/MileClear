package expo.modules.caraudio

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Which car the phone is in, from its connected Bluetooth audio outputs
// (docs/car-bluetooth-plan-oct2026.md). Same JS API as the iPhone side.
//
// AudioManager.getDevices lists every connected output, not only the one
// playing, so a car paired for music or calls shows up while nothing plays.
// No permission is needed. Without BLUETOOTH_CONNECT the system masks the
// address to "XX:XX:XX:XX:EE:FF"; we always mask it ourselves too, so the id
// stays the same whether or not the app ever holds that permission.
//
// Only reads and reports. Nothing here starts or wakes trip recording: on
// Android that is a separate decision (Bluetooth-started location in the
// background is restricted from Android 12).
class CarAudioModule : Module() {
  // Taken from the application context once, so a destroyed activity or
  // React context never leaves us holding (or losing) the service.
  @Volatile private var cachedAudioManager: AudioManager? = null

  private val audioManager: AudioManager?
    get() {
      cachedAudioManager?.let { return it }
      val am = try {
        appContext.reactContext?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      } catch (_: Throwable) {
        null
      }
      cachedAudioManager = am
      return am
    }

  // "name|id" of the car last reported, so events only fire on a change.
  // Registering the callback replays every current device as "added", and a
  // car's music and calls outputs come and go separately; neither is news.
  @Volatile private var lastKey: String? = null
  @Volatile private var registered = false

  // Events with at least one JS listener. Expo's Android OnStopObserving with
  // no event name runs when EITHER event loses its last listener, so we track
  // both and stop only when neither is observed (as iOS does).
  private val observed = HashSet<String>()

  private val callback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = check()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = check()
  }

  override fun definition() = ModuleDefinition {
    Name("CarAudio")

    Events("onCarConnected", "onCarDisconnected")

    Function("isConnectedToCar") {
      currentCar() != null
    }

    Function("currentCarAudio") {
      currentCar()
    }

    Function("currentCarAudioOutputs") {
      currentCars()
    }

    // Lets JS tell this binary from one with the old iPhone-only module.
    Function("hasOutputsApi") {
      true
    }

    OnStartObserving("onCarConnected") { observe("onCarConnected", true) }
    OnStartObserving("onCarDisconnected") { observe("onCarDisconnected", true) }
    OnStopObserving("onCarConnected") { observe("onCarConnected", false) }
    OnStopObserving("onCarDisconnected") { observe("onCarDisconnected", false) }

    OnDestroy {
      synchronized(observed) { observed.clear() }
      stop(force = true)
    }
  }

  private fun observe(event: String, on: Boolean) {
    val any = synchronized(observed) {
      if (on) observed.add(event) else observed.remove(event)
      observed.isNotEmpty()
    }
    if (any) start() else stop()
  }

  @Synchronized
  private fun start() {
    if (registered) return
    val am = audioManager ?: return
    try {
      lastKey = keyOf(currentCar())
      am.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
      registered = true
    } catch (_: Throwable) {
      registered = false
    }
  }

  @Synchronized
  private fun stop(force: Boolean = false) {
    if (!registered && !force) return
    registered = false
    try {
      audioManager?.unregisterAudioDeviceCallback(callback)
    } catch (_: Throwable) {
      // best effort
    }
  }

  private fun check() {
    try {
      val car = currentCar()
      val key = keyOf(car)
      if (key == lastKey) return
      lastKey = key
      if (car != null) {
        sendEvent("onCarConnected", car)
      } else {
        sendEvent("onCarDisconnected", mapOf<String, Any?>())
      }
    } catch (_: Throwable) {
      // never throw out of a system callback
    }
  }

  // The best car-like output connected now, as { name, id, kind }, or null.
  private fun currentCar(): Map<String, Any?>? = currentCars().firstOrNull()

  // Every car-like output connected now, best first, one per name|id (a
  // car's music and calls outputs are the same car).
  private fun currentCars(): List<Map<String, Any?>> {
    val devices = try {
      audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    } catch (_: Throwable) {
      null
    } ?: return emptyList()

    val kind = if (inCarMode()) "android_auto" else "bluetooth"
    val seen = HashSet<String>()
    return devices
      .filter { safeRank(it) != Int.MAX_VALUE }
      .sortedBy { safeRank(it) } // stable: same-type outputs keep the system's order
      .mapNotNull { d ->
        try {
          val name = nameOf(d) ?: return@mapNotNull null
          val car = mapOf("name" to name, "id" to idOf(d), "kind" to kind)
          if (seen.add(keyOf(car)!!)) car else null
        } catch (_: Throwable) {
          null // one odd device never empties the list
        }
      }
  }

  private fun safeRank(d: AudioDeviceInfo): Int = try {
    rankOf(d.type)
  } catch (_: Throwable) {
    Int.MAX_VALUE
  }

  // Bluetooth music first (what a car stereo is on most of the time), then
  // calls, then LE Audio. Wired, USB and the phone's own speaker never count.
  private fun rankOf(type: Int): Int = when (type) {
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> 0
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 1
    TYPE_BLE_HEADSET, TYPE_BLE_SPEAKER -> 2
    else -> Int.MAX_VALUE
  }

  // getProductName() falls back to Build.MODEL (the phone's own model) when
  // the device has no name, so that value means "no name", not a car.
  private fun nameOf(d: AudioDeviceInfo): String? {
    val name = d.productName?.toString()?.trim().orEmpty()
    if (name.isEmpty() || name == Build.MODEL) return null
    return name
  }

  // The masked address: the last two bytes, which is all an app without
  // BLUETOOTH_CONNECT is ever given. Enough to tell two same-named cars apart
  // most of the time; JS only uses it as a tie-breaker. Null when there is
  // no address to use.
  private fun idOf(d: AudioDeviceInfo): String? {
    // getAddress() is API 28; older phones (minSdk 24) get no id.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
    val address = d.address?.trim().orEmpty().uppercase()
    if (address.isEmpty()) return null
    if (!MAC.matches(address)) return null
    val tail = address.substring(address.length - 5)
    if (tail == "00:00") return null
    return "XX:XX:XX:XX:$tail"
  }

  // Android Auto puts the phone into car mode while it projects. The car's
  // name still comes from its Bluetooth output.
  private fun inCarMode(): Boolean {
    return try {
      val ui = appContext.reactContext?.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
      ui?.currentModeType == Configuration.UI_MODE_TYPE_CAR
    } catch (_: Throwable) {
      false
    }
  }

  private fun keyOf(car: Map<String, Any?>?): String? =
    car?.let { "${it["name"]}|${it["id"]}" }

  companion object {
    // AudioDeviceInfo.TYPE_BLE_HEADSET / TYPE_BLE_SPEAKER (API 31). Plain
    // values so older phones just never match them.
    private const val TYPE_BLE_HEADSET = 26
    private const val TYPE_BLE_SPEAKER = 27
    private val MAC = Regex("^([0-9A-FX]{2}:){5}[0-9A-F]{2}$")
  }
}
