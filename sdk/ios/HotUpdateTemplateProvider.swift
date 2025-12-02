import Foundation

/**
 * Template Provider with Hot Update support for iOS
 *
 * Replace your existing TemplateProvider with this one to enable hot updates.
 *
 * Usage:
 * ```swift
 * // Initialize hot update in AppDelegate
 * LynxHotUpdate.shared.initialize(deploymentKey: "your-key", serverUrl: "https://your-server.com")
 *
 * // Use HotUpdateTemplateProvider
 * let provider = HotUpdateTemplateProvider()
 * ```
 */
class HotUpdateTemplateProvider: NSObject, LynxTemplateProvider {
    
    func loadTemplate(withUrl url: String!, onComplete callback: LynxTemplateLoadBlock!) {
        DispatchQueue.global(qos: .userInitiated).async {
            // Try to load from hot update first
            if let data = LynxHotUpdate.shared.loadBundle(url) {
                DispatchQueue.main.async {
                    callback(data, nil)
                }
                return
            }
            
            // Fallback to bundle
            if let filePath = Bundle.main.path(forResource: url, ofType: "bundle") {
                do {
                    let data = try Data(contentsOf: URL(fileURLWithPath: filePath))
                    DispatchQueue.main.async {
                        callback(data, nil)
                    }
                } catch {
                    DispatchQueue.main.async {
                        callback(nil, error)
                    }
                }
            } else {
                let error = NSError(
                    domain: "com.lynx.hotupdate",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Bundle not found: \(url ?? "")"]
                )
                DispatchQueue.main.async {
                    callback(nil, error)
                }
            }
        }
    }
}
