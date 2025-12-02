package com.lynx.hotupdate

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.*
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

/**
 * Lynx Hot Update SDK for Android
 * 
 * Usage:
 * 1. Initialize in Application:
 *    LynxHotUpdate.init(context, "your-deployment-key", "https://your-server.com")
 * 
 * 2. Check for updates:
 *    LynxHotUpdate.checkForUpdate { result -> ... }
 * 
 * 3. Get bundle path in TemplateProvider:
 *    val bundlePath = LynxHotUpdate.getBundlePath("main.lynx.bundle")
 */
object LynxHotUpdate {
    private const val TAG = "LynxHotUpdate"
    private const val PREFS_NAME = "lynx_hot_update"
    private const val KEY_CURRENT_VERSION = "current_version"
    private const val KEY_PENDING_VERSION = "pending_version"
    private const val KEY_BUNDLE_HASH = "bundle_hash"
    
    private lateinit var context: Context
    private lateinit var deploymentKey: String
    private lateinit var serverUrl: String
    private lateinit var prefs: SharedPreferences
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    /**
     * Initialize the hot update SDK
     */
    fun init(context: Context, deploymentKey: String, serverUrl: String) {
        this.context = context.applicationContext
        this.deploymentKey = deploymentKey
        this.serverUrl = serverUrl.trimEnd('/')
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        Log.d(TAG, "Initialized with server: $serverUrl")
        
        // Apply pending update if exists
        applyPendingUpdate()
    }
    
    /**
     * Get the path to the current bundle
     * Returns the hot update bundle if available, otherwise returns the asset path
     */
    fun getBundlePath(bundleName: String): String {
        val hotBundleDir = File(context.filesDir, "lynx_bundles")
        val hotBundle = File(hotBundleDir, bundleName)
        
        return if (hotBundle.exists()) {
            Log.d(TAG, "Using hot update bundle: ${hotBundle.absolutePath}")
            hotBundle.absolutePath
        } else {
            Log.d(TAG, "Using default asset bundle: $bundleName")
            bundleName // Return asset name for loading from assets
        }
    }
    
    /**
     * Check if bundle should be loaded from file system (hot update) or assets
     */
    fun shouldLoadFromFile(bundleName: String): Boolean {
        val hotBundleDir = File(context.filesDir, "lynx_bundles")
        val hotBundle = File(hotBundleDir, bundleName)
        return hotBundle.exists()
    }
    
    /**
     * Load bundle bytes - either from hot update or assets
     */
    fun loadBundle(bundleName: String): ByteArray {
        val hotBundleDir = File(context.filesDir, "lynx_bundles")
        val hotBundle = File(hotBundleDir, bundleName)
        
        return if (hotBundle.exists()) {
            Log.d(TAG, "Loading hot update bundle")
            hotBundle.readBytes()
        } else {
            Log.d(TAG, "Loading asset bundle")
            context.assets.open(bundleName).use { it.readBytes() }
        }
    }
    
    /**
     * Check for available updates
     */
    fun checkForUpdate(callback: (UpdateResult) -> Unit) {
        scope.launch {
            try {
                val currentVersion = prefs.getString(KEY_CURRENT_VERSION, "0.0.0") ?: "0.0.0"
                
                val url = URL("$serverUrl/api/check-update")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("X-Deployment-Key", deploymentKey)
                connection.doOutput = true
                
                val requestBody = JSONObject().apply {
                    put("currentVersion", currentVersion)
                    put("platform", "android")
                }.toString()
                
                connection.outputStream.use { os ->
                    os.write(requestBody.toByteArray())
                }
                
                val responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().readText()
                    val json = JSONObject(response)
                    
                    if (json.getBoolean("updateAvailable")) {
                        val result = UpdateResult(
                            updateAvailable = true,
                            version = json.getString("version"),
                            downloadUrl = json.getString("downloadUrl"),
                            hash = json.getString("hash"),
                            size = json.getLong("size"),
                            description = json.optString("description", ""),
                            mandatory = json.optBoolean("mandatory", false)
                        )
                        withContext(Dispatchers.Main) { callback(result) }
                    } else {
                        withContext(Dispatchers.Main) { 
                            callback(UpdateResult(updateAvailable = false)) 
                        }
                    }
                } else {
                    Log.e(TAG, "Check update failed: $responseCode")
                    withContext(Dispatchers.Main) { 
                        callback(UpdateResult(updateAvailable = false, error = "Server error: $responseCode")) 
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Check update error", e)
                withContext(Dispatchers.Main) { 
                    callback(UpdateResult(updateAvailable = false, error = e.message)) 
                }
            }
        }
    }
    
    /**
     * Download and install an update
     */
    fun downloadUpdate(
        updateResult: UpdateResult,
        onProgress: ((Int) -> Unit)? = null,
        onComplete: (Boolean, String?) -> Unit
    ) {
        if (!updateResult.updateAvailable || updateResult.downloadUrl == null) {
            onComplete(false, "No update available")
            return
        }
        
        scope.launch {
            try {
                val url = URL(updateResult.downloadUrl)
                val connection = url.openConnection() as HttpURLConnection
                connection.connect()
                
                val totalSize = connection.contentLength
                val tempFile = File(context.cacheDir, "update_${updateResult.version}.zip")
                
                connection.inputStream.use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(8192)
                        var downloaded = 0L
                        var bytesRead: Int
                        
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloaded += bytesRead
                            
                            if (totalSize > 0) {
                                val progress = ((downloaded * 100) / totalSize).toInt()
                                withContext(Dispatchers.Main) { onProgress?.invoke(progress) }
                            }
                        }
                    }
                }
                
                // Verify hash
                val fileHash = calculateHash(tempFile)
                if (updateResult.hash != null && fileHash != updateResult.hash) {
                    tempFile.delete()
                    withContext(Dispatchers.Main) { 
                        onComplete(false, "Hash verification failed") 
                    }
                    return@launch
                }
                
                // Extract and install
                val success = installUpdate(tempFile, updateResult.version!!)
                tempFile.delete()
                
                withContext(Dispatchers.Main) {
                    if (success) {
                        onComplete(true, null)
                    } else {
                        onComplete(false, "Installation failed")
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Download error", e)
                withContext(Dispatchers.Main) { 
                    onComplete(false, e.message) 
                }
            }
        }
    }
    
    private fun installUpdate(zipFile: File, version: String): Boolean {
        return try {
            val bundleDir = File(context.filesDir, "lynx_bundles")
            val pendingDir = File(context.filesDir, "lynx_pending")
            
            // Extract to pending directory
            pendingDir.deleteRecursively()
            pendingDir.mkdirs()
            
            unzip(zipFile, pendingDir)
            
            // Save pending version info
            prefs.edit()
                .putString(KEY_PENDING_VERSION, version)
                .apply()
            
            Log.d(TAG, "Update downloaded, will apply on next launch")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Install error", e)
            false
        }
    }
    
    private fun applyPendingUpdate() {
        val pendingVersion = prefs.getString(KEY_PENDING_VERSION, null) ?: return
        
        val pendingDir = File(context.filesDir, "lynx_pending")
        val bundleDir = File(context.filesDir, "lynx_bundles")
        
        if (!pendingDir.exists()) return
        
        try {
            // Replace current bundle with pending
            bundleDir.deleteRecursively()
            pendingDir.renameTo(bundleDir)
            
            // Update version info
            prefs.edit()
                .putString(KEY_CURRENT_VERSION, pendingVersion)
                .remove(KEY_PENDING_VERSION)
                .apply()
            
            Log.d(TAG, "Applied pending update: $pendingVersion")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to apply pending update", e)
        }
    }
    
    private fun calculateHash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    
    private fun unzip(zipFile: File, destDir: File) {
        java.util.zip.ZipInputStream(FileInputStream(zipFile)).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val file = File(destDir, entry.name)
                if (entry.isDirectory) {
                    file.mkdirs()
                } else {
                    file.parentFile?.mkdirs()
                    FileOutputStream(file).use { fos ->
                        zis.copyTo(fos)
                    }
                }
                entry = zis.nextEntry
            }
        }
    }
    
    /**
     * Get current installed version
     */
    fun getCurrentVersion(): String {
        return prefs.getString(KEY_CURRENT_VERSION, "0.0.0") ?: "0.0.0"
    }
    
    /**
     * Clear all hot updates and revert to bundled version
     */
    fun clearUpdates() {
        File(context.filesDir, "lynx_bundles").deleteRecursively()
        File(context.filesDir, "lynx_pending").deleteRecursively()
        prefs.edit().clear().apply()
        Log.d(TAG, "All updates cleared")
    }
}

data class UpdateResult(
    val updateAvailable: Boolean,
    val version: String? = null,
    val downloadUrl: String? = null,
    val hash: String? = null,
    val size: Long = 0,
    val description: String = "",
    val mandatory: Boolean = false,
    val error: String? = null
)
