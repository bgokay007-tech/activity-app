Pod::Spec.new do |s|
  s.name           = 'HealthBridge'
  s.version        = '0.1.0'
  s.summary        = 'Mac bitince Apple Health uzerinden kalori/nabiz okuyan kopru'
  s.author         = 'AcTiViTy'
  s.homepage       = 'https://activity.app'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true
  # bkz. WearBridge.podspec'teki ayni yorum — swift_version belirtilmezse bazi
  # ortamlarda (ör. EAS build makineleri) toolchain kesfi basarisiz olabiliyor.
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.source_files = '**/*.{h,m,mm,swift}'
end
