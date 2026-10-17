Pod::Spec.new do |s|
  s.name           = 'LanBackupSaf'
  s.version        = '1.0.0'
  s.summary        = 'Native file access helpers for LAN Backup'
  s.description    = 'Native file access helpers for LAN Backup'
  s.license        = { :type => 'GPL-3.0-only' }
  s.author         = 'LAN Backup'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Marcseb/lan-backup.git', :tag => s.version.to_s }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
