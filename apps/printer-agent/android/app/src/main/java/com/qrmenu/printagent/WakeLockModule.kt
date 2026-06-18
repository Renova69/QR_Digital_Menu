package com.qrmenu.printagent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WakeLockModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun getName(): String {
        return "WakeLockModule"
    }

    @ReactMethod
    fun acquire() {
        val context = reactApplicationContext

        // Acquire CPU WakeLock
        if (wakeLock == null) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PrintAgent::SocketWakeLock")
            wakeLock?.setReferenceCounted(false)
        }
        if (wakeLock?.isHeld == false) {
            wakeLock?.acquire()
        }

        // Acquire WiFi Lock
        if (wifiLock == null) {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val lockType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wifiManager.createWifiLock(lockType, "PrintAgent::WifiLock")
            wifiLock?.setReferenceCounted(false)
        }
        if (wifiLock?.isHeld == false) {
            wifiLock?.acquire()
        }
    }

    @ReactMethod
    fun release() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        if (wifiLock?.isHeld == true) {
            wifiLock?.release()
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        val context = reactApplicationContext
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val isIgnoring = powerManager.isIgnoringBatteryOptimizations(context.packageName)
            promise.resolve(isIgnoring)
        } else {
            promise.resolve(true) // Battery optimization doesn't exist before M
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption() {
        val context = reactApplicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                try {
                    context.startActivity(intent)
                } catch (e: Exception) {
                    val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(fallbackIntent)
                }
            }
        }
    }
}
