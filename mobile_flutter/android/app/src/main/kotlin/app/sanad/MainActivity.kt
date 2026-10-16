package app.sanad

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/*
  FlutterFragmentActivity لأن نافذة البصمة (local_auth وflutter_secure_storage) تحتاجها.
  قناة app.sanad/privacy:
  - setSecure: يمنع لقطات الشاشة وصورة المهام الأخيرة أثناء فتح «مذكّرتي» (FLAG_SECURE).
  - setNeutralIcon: الوضع المتحفّظ — يبدّل أيقونة التطبيق واسمه في قائمة التطبيقات إلى «ملاحظاتي».
*/
class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "app.sanad/privacy").setMethodCallHandler { call, result ->
            when (call.method) {
                "setSecure" -> {
                    if (call.arguments == true) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    result.success(null)
                }
                "setNeutralIcon" -> {
                    val neutral = call.arguments == true
                    setLauncher(DefaultLauncher::class.java, !neutral)
                    setLauncher(NotesLauncher::class.java, neutral)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun setLauncher(cls: Class<*>, enabled: Boolean) {
        packageManager.setComponentEnabledSetting(
            ComponentName(this, cls),
            if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
    }
}

/*
  مدخلا قائمة التطبيقات: «سند» بأيقونته، و«ملاحظاتي» بأيقونة محايدة — واحد منهما مفعّل فقط.
  كلاهما يمرّر الفتح (ومعه بيانات الإشعار إن وُجدت) إلى MainActivity ثم ينتهي.
  نشاطان حقيقيان لا activity-alias، لأن أداة Flutter تبحث عن <activity> بمرشّح LAUNCHER.
*/
open class DefaultLauncher : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(intent).setClass(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        finish()
    }
}

class NotesLauncher : DefaultLauncher()
