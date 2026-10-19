Pod::Spec.new do |s|
  s.name           = 'NavVoice'
  s.version        = '1.0.0'
  s.summary        = 'Audio session for spoken directions.'
  s.description    = 'Activates a playback / voicePrompt audio session that ducks other audio for each spoken direction, and releases it afterwards.'
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
