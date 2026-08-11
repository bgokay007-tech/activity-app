Pod::Spec.new do |s|
  s.name           = 'WearBridge'
  s.version        = '0.1.0'
  s.summary        = 'Saatten telefona canli mac skoru koprusu'
  s.author         = 'AcTiViTy'
  s.homepage       = 'https://activity.app'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true
  # swift_version belirtilmezse CocoaPods, hangi Swift derleyicisi kullanılacağını
  # anlamak için toolchain'i otomatik keşfetmeye çalışıyor — bazı ortamlarda (ör. EAS
  # build makineleri) bu keşif başarısız olup "Unable to automatically discover your
  # Swift toolchain" hatasını veriyor. ExpoModulesCore'un kendi podspec'iyle aynı sürüm.
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end
