# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes JavascriptInterface

# Preserve WebView JavaScript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Capacitor Plugins and Bridge
-keep public class * extends com.getcapacitor.Plugin {
    public *;
}
-keep class com.getcapacitor.** { *; }

# Preserve App Native Classes and Plugins
-keep class nimiyo.litedownloader.** { *; }

