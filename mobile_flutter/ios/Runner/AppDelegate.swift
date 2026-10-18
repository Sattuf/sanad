import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // قناة app.sanad/privacy (نظير MainActivity.kt):
    // setNeutralIcon — الوضع المتحفّظ: أيقونة «ملاحظاتي» البديلة (NotesIcon في Assets.xcassets).
    // setSecure — لا مقابل له في iOS؛ الشاشة تُغطّى من Flutter عند الانتقال للخلفية.
    guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SanadPrivacy") else { return }
    FlutterMethodChannel(name: "app.sanad/privacy", binaryMessenger: registrar.messenger()).setMethodCallHandler { call, result in
      switch call.method {
      case "setNeutralIcon":
        let neutral = (call.arguments as? Bool) ?? false
        guard UIApplication.shared.supportsAlternateIcons else { return result(nil) }
        UIApplication.shared.setAlternateIconName(neutral ? "NotesIcon" : nil) { _ in result(nil) }
      case "setSecure":
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }
}
