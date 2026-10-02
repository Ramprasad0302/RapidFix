# Firebase and AndroidX ship their own consumer rules.

# Razorpay checkout (per Razorpay's Android integration guide).
-keepattributes *Annotation*
-dontwarn com.razorpay.**
-keep class com.razorpay.** {*;}
-optimizations !method/inlining/
-keepclasseswithmembers class * {
  public void onPayment*(...);
}
