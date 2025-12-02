import Foundation

/**
 * Lynx Hot Update SDK for iOS
 *
 * Usage:
 * 1. Initialize in AppDelegate:
 *    LynxHotUpdate.shared.initialize(deploymentKey: "your-key", serverUrl: "https://your-server.com")
 *
 * 2. Check for updates:
 *    LynxHotUpdate.shared.checkForUpdate { result in ... }
 *
 * 3. Get bundle path in TemplateProvider:
 *    let bundlePath = LynxHotUpdate.shared.getBundlePath("main.lynx.bundle")
 */
public class LynxHotUpdate {
    
    public static let shared = LynxHotUpdate()
    
    private let userDefaultsKey = "lynx_hot_update"
    private let currentVersionKey = "current_version"
    private let pendingVersionKey = "pending_version"
    
    private var deploymentKey: String = ""
    private var serverUrl: String = ""
    private var isInitialized = false
    
    private init() {}
    
    // MARK: - Public Methods
    
    /// Initialize the hot update SDK
    public func initialize(deploymentKey: String, serverUrl: String) {
        self.deploymentKey = deploymentKey
        self.serverUrl = serverUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.isInitialized = true
        
        print("[LynxHotUpdate] Initialized with server: \(serverUrl)")
        
        // Apply pending update if exists
        applyPendingUpdate()
    }
    
    /// Get the path to the current bundle
    public func getBundlePath(_ bundleName: String) -> String {
        let hotBundleDir = getHotBundleDirectory()
        let hotBundlePath = hotBundleDir.appendingPathComponent(bundleName)
        
        if FileManager.default.fileExists(atPath: hotBundlePath.path) {
            print("[LynxHotUpdate] Using hot update bundle: \(hotBundlePath.path)")
            return hotBundlePath.path
        } else {
            print("[LynxHotUpdate] Using default bundle: \(bundleName)")
            return bundleName
        }
    }
    
    /// Check if bundle should be loaded from file system
    public func shouldLoadFromFile(_ bundleName: String) -> Bool {
        let hotBundleDir = getHotBundleDirectory()
        let hotBundlePath = hotBundleDir.appendingPathComponent(bundleName)
        return FileManager.default.fileExists(atPath: hotBundlePath.path)
    }
    
    /// Load bundle data
    public func loadBundle(_ bundleName: String) -> Data? {
        let hotBundleDir = getHotBundleDirectory()
        let hotBundlePath = hotBundleDir.appendingPathComponent(bundleName)
        
        if FileManager.default.fileExists(atPath: hotBundlePath.path) {
            print("[LynxHotUpdate] Loading hot update bundle")
            return try? Data(contentsOf: hotBundlePath)
        } else {
            print("[LynxHotUpdate] Loading asset bundle")
            if let path = Bundle.main.path(forResource: bundleName, ofType: nil) {
                return try? Data(contentsOf: URL(fileURLWithPath: path))
            }
            return nil
        }
    }
    
    /// Check for available updates
    public func checkForUpdate(completion: @escaping (UpdateResult) -> Void) {
        guard isInitialized else {
            completion(UpdateResult(updateAvailable: false, error: "SDK not initialized"))
            return
        }
        
        let currentVersion = UserDefaults.standard.string(forKey: currentVersionKey) ?? "0.0.0"
        
        guard let url = URL(string: "\(serverUrl)/api/check-update") else {
            completion(UpdateResult(updateAvailable: false, error: "Invalid server URL"))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deploymentKey, forHTTPHeaderField: "X-Deployment-Key")
        
        let body: [String: Any] = [
            "currentVersion": currentVersion,
            "platform": "ios"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(UpdateResult(updateAvailable: false, error: error.localizedDescription))
                    return
                }
                
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    completion(UpdateResult(updateAvailable: false, error: "Invalid response"))
                    return
                }
                
                if let updateAvailable = json["updateAvailable"] as? Bool, updateAvailable {
                    let result = UpdateResult(
                        updateAvailable: true,
                        version: json["version"] as? String,
                        downloadUrl: json["downloadUrl"] as? String,
                        hash: json["hash"] as? String,
                        size: json["size"] as? Int64 ?? 0,
                        description: json["description"] as? String ?? "",
                        mandatory: json["mandatory"] as? Bool ?? false
                    )
                    completion(result)
                } else {
                    completion(UpdateResult(updateAvailable: false))
                }
            }
        }.resume()
    }
    
    /// Download and install an update
    public func downloadUpdate(
        _ updateResult: UpdateResult,
        onProgress: ((Int) -> Void)? = nil,
        completion: @escaping (Bool, String?) -> Void
    ) {
        guard updateResult.updateAvailable,
              let downloadUrlString = updateResult.downloadUrl,
              let downloadUrl = URL(string: downloadUrlString) else {
            completion(false, "No update available")
            return
        }
        
        let task = URLSession.shared.downloadTask(with: downloadUrl) { [weak self] tempUrl, response, error in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                if let error = error {
                    completion(false, error.localizedDescription)
                    return
                }
                
                guard let tempUrl = tempUrl else {
                    completion(false, "Download failed")
                    return
                }
                
                // Verify hash if provided
                if let expectedHash = updateResult.hash {
                    let fileHash = self.calculateHash(tempUrl)
                    if fileHash != expectedHash {
                        completion(false, "Hash verification failed")
                        return
                    }
                }
                
                // Install update
                let success = self.installUpdate(tempUrl, version: updateResult.version ?? "unknown")
                completion(success, success ? nil : "Installation failed")
            }
        }
        
        task.resume()
    }
    
    /// Get current installed version
    public func getCurrentVersion() -> String {
        return UserDefaults.standard.string(forKey: currentVersionKey) ?? "0.0.0"
    }
    
    /// Clear all hot updates
    public func clearUpdates() {
        try? FileManager.default.removeItem(at: getHotBundleDirectory())
        try? FileManager.default.removeItem(at: getPendingDirectory())
        UserDefaults.standard.removeObject(forKey: currentVersionKey)
        UserDefaults.standard.removeObject(forKey: pendingVersionKey)
        print("[LynxHotUpdate] All updates cleared")
    }
    
    // MARK: - Private Methods
    
    private func getHotBundleDirectory() -> URL {
        let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsDir.appendingPathComponent("lynx_bundles")
    }
    
    private func getPendingDirectory() -> URL {
        let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documentsDir.appendingPathComponent("lynx_pending")
    }
    
    private func installUpdate(_ zipUrl: URL, version: String) -> Bool {
        do {
            let pendingDir = getPendingDirectory()
            
            // Clear pending directory
            try? FileManager.default.removeItem(at: pendingDir)
            try FileManager.default.createDirectory(at: pendingDir, withIntermediateDirectories: true)
            
            // Unzip to pending directory
            try unzip(zipUrl, to: pendingDir)
            
            // Save pending version
            UserDefaults.standard.set(version, forKey: pendingVersionKey)
            
            print("[LynxHotUpdate] Update downloaded, will apply on next launch")
            return true
        } catch {
            print("[LynxHotUpdate] Install error: \(error)")
            return false
        }
    }
    
    private func applyPendingUpdate() {
        guard let pendingVersion = UserDefaults.standard.string(forKey: pendingVersionKey) else {
            return
        }
        
        let pendingDir = getPendingDirectory()
        let bundleDir = getHotBundleDirectory()
        
        guard FileManager.default.fileExists(atPath: pendingDir.path) else {
            return
        }
        
        do {
            // Remove current bundle
            try? FileManager.default.removeItem(at: bundleDir)
            
            // Move pending to current
            try FileManager.default.moveItem(at: pendingDir, to: bundleDir)
            
            // Update version
            UserDefaults.standard.set(pendingVersion, forKey: currentVersionKey)
            UserDefaults.standard.removeObject(forKey: pendingVersionKey)
            
            print("[LynxHotUpdate] Applied pending update: \(pendingVersion)")
        } catch {
            print("[LynxHotUpdate] Failed to apply pending update: \(error)")
        }
    }
    
    private func calculateHash(_ fileUrl: URL) -> String {
        guard let data = try? Data(contentsOf: fileUrl) else { return "" }
        
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }
    
    private func unzip(_ zipUrl: URL, to destDir: URL) throws {
        // Simple unzip implementation
        // In production, use a proper zip library like ZIPFoundation
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        process.arguments = ["-o", zipUrl.path, "-d", destDir.path]
        try process.run()
        process.waitUntilExit()
    }
}

// MARK: - Update Result

public struct UpdateResult {
    public let updateAvailable: Bool
    public let version: String?
    public let downloadUrl: String?
    public let hash: String?
    public let size: Int64
    public let description: String
    public let mandatory: Bool
    public let error: String?
    
    public init(
        updateAvailable: Bool,
        version: String? = nil,
        downloadUrl: String? = nil,
        hash: String? = nil,
        size: Int64 = 0,
        description: String = "",
        mandatory: Bool = false,
        error: String? = nil
    ) {
        self.updateAvailable = updateAvailable
        self.version = version
        self.downloadUrl = downloadUrl
        self.hash = hash
        self.size = size
        self.description = description
        self.mandatory = mandatory
        self.error = error
    }
}

// Import CommonCrypto for SHA256
import CommonCrypto
