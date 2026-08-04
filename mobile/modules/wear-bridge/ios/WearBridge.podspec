Pod::Spec.new do |s|
  s.name           = 'WearBridge'
  s.version        = '0.1.0'
  s.summary        = 'Saatten telefona canli mac skoru koprusu'
  s.author         = 'AcTiViTy'
  s.homepage       = 'https://activity.app'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end
