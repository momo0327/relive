Pod::Spec.new do |s|
  s.name           = 'ReliveVideoMerge'
  s.version        = '1.0.0'
  s.summary        = 'Joins the clips of one recording (front and back camera) into a single video.'
  s.description    = s.summary
  s.author         = 'Zenia Digital'
  s.homepage       = 'https://github.com/momo0327/relive'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
