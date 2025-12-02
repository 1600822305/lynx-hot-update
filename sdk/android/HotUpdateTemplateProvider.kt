package com.lynx.hotupdate

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.ByteArrayOutputStream

/**
 * Template Provider with Hot Update support
 * 
 * Replace your existing TemplateProvider with this one to enable hot updates.
 * 
 * Usage in your Application class:
 * ```kotlin
 * // Initialize hot update
 * LynxHotUpdate.init(this, "your-deployment-key", "https://your-server.com")
 * 
 * // Use HotUpdateTemplateProvider instead of your custom provider
 * LynxEnv.inst().setTemplateProvider(HotUpdateTemplateProvider(this))
 * ```
 */
class HotUpdateTemplateProvider(context: Context) : AbsTemplateProvider() {
    
    private val mContext: Context = context.applicationContext
    
    override fun loadTemplate(uri: String, callback: Callback) {
        Thread {
            try {
                val bundleBytes = LynxHotUpdate.loadBundle(uri)
                callback.onSuccess(bundleBytes)
            } catch (e: Exception) {
                // Fallback to assets if hot update fails
                try {
                    mContext.assets.open(uri).use { inputStream ->
                        ByteArrayOutputStream().use { outputStream ->
                            val buffer = ByteArray(1024)
                            var length: Int
                            while (inputStream.read(buffer).also { length = it } != -1) {
                                outputStream.write(buffer, 0, length)
                            }
                            callback.onSuccess(outputStream.toByteArray())
                        }
                    }
                } catch (fallbackError: Exception) {
                    callback.onFailed(fallbackError.message)
                }
            }
        }.start()
    }
}
