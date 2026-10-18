package expo.modules.navvoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Audio focus for spoken directions (1.4.0, docs/navigation-1.4.0/PLAN.md F4).
//
// expo-speech speaks; this asks Android to duck other audio around each
// prompt: AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK with the usage made for
// navigation (USAGE_ASSISTANCE_NAVIGATION_GUIDANCE), released straight after
// the prompt so music comes back up. Nothing is held between prompts.
//
// No prompt during a call: beginPrompt returns false while the phone is in a
// call (MODE_IN_CALL / MODE_IN_COMMUNICATION) or when focus is refused. A
// focus loss mid-prompt (a call arriving) is sent to JS as onInterruption.
//
// Nothing here touches location or trip recording.
class NavVoiceModule : Module() {
  private var request: AudioFocusRequest? = null

  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> sendEvent("onInterruption", mapOf("began" to true))
      AudioManager.AUDIOFOCUS_GAIN -> sendEvent("onInterruption", mapOf("began" to false))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NavVoice")

    Events("onInterruption")

    Function("isCallActive") {
      callActive()
    }

    AsyncFunction("beginPrompt") {
      val am = audioManager ?: return@AsyncFunction false
      if (callActive()) return@AsyncFunction false
      val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attrs)
          .setOnAudioFocusChangeListener(focusListener)
          .build()
        request = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      }
      granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    AsyncFunction("endPrompt") {
      val am = audioManager ?: return@AsyncFunction Unit
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        request?.let { am.abandonAudioFocusRequest(it) }
        request = null
      } else {
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(focusListener)
      }
      Unit
    }
  }

  private fun callActive(): Boolean {
    val mode = audioManager?.mode ?: return false
    return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
  }
}
