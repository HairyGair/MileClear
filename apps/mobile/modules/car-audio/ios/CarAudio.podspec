Pod::Spec.new do |s|
  s.name           = 'CarAudio'
  s.version        = '1.0.0'
  s.summary        = 'Detects when the phone connects to car audio (CarPlay / Bluetooth).'
  s.description    = 'Observes AVAudioSession route changes to signal when a car audio route connects, used as a trip-start trigger.'
  s.author         = 'MileClear'
  s.homepage       = 'https://mileclear.com'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
