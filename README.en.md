# 🔥 Lynx Hot Update

**🌐 Language / 语言**: [中文](./README.md) | [English](#)

> OTA update solution for Lynx apps - Push updates without app store review
>
> Like CodePush, but for Lynx!

## 📦 Installation

```bash
npm install -g lynx-hot-update
```

> ⚠️ **Prerequisite**: You need to create a native project with `lynx-native-cli` first

## ✨ Features

- 🚀 **Instant Updates**: Bypass app stores, push JS Bundle updates directly
- 🔄 **Differential Updates**: Download only changed content, save bandwidth
- 🔐 **Security Verification**: SHA256 hash verification ensures package integrity
- 📊 **Gradual Rollout**: Support percentage-based gradual rollout
- ⏪ **One-click Rollback**: Quickly revert to previous version when issues occur
- 🔑 **Deployment Keys**: Separate Staging and Production environments
- 📱 **Multi-platform**: Support both Android and iOS

## 🚀 Quick Start

### 1. Initialize Hot Update

```bash
cd your-lynx-project
lynx-update init
```

### 2. Integrate SDK

#### Android

Initialize in your `Application` class:

```kotlin
import com.lynx.hotupdate.LynxHotUpdate
import com.lynx.hotupdate.HotUpdateTemplateProvider

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Initialize hot update
        LynxHotUpdate.init(
            this,
            "your-deployment-key",
            "https://your-update-server.com"
        )
        
        // Use hot update TemplateProvider
        LynxEnv.inst().setTemplateProvider(HotUpdateTemplateProvider(this))
    }
}
```

#### iOS

Initialize in `AppDelegate`:

```swift
import LynxHotUpdate

func application(_ application: UIApplication, didFinishLaunchingWithOptions...) {
    // Initialize hot update
    LynxHotUpdate.shared.initialize(
        deploymentKey: "your-deployment-key",
        serverUrl: "https://your-update-server.com"
    )
}
```

### 3. Publish Updates

```bash
# Build your Lynx app
npm run build

# Publish update
lynx-update publish --version 1.0.1 --description "Bug fixes"
```

## 📋 Command Reference

### Initialize

```bash
lynx-update init                    # Initialize hot update config
lynx-update init --server <url>     # Specify update server
```

### Publish Updates

```bash
lynx-update publish                           # Publish to all platforms
lynx-update publish -p android                # Publish to Android only
lynx-update publish -v 1.0.1                  # Specify version
lynx-update publish -d "Fixed some issues"   # Add description
lynx-update publish --mandatory               # Force update
lynx-update publish --rollout 50              # Gradual rollout 50%
```

### Rollback

```bash
lynx-update rollback                          # Interactive version selection
lynx-update rollback -v 1.0.0                 # Rollback to specific version
lynx-update rollback -p android               # Rollback Android only
```

### View Status

```bash
lynx-update status                            # View deployment status
lynx-update status -p android                 # View Android status
```

### Configuration

```bash
lynx-update config --show                     # Show current config
lynx-update config --server <url>             # Change server URL
```

## 🔧 Configuration File

### lynx-update.json

```json
{
  "appKey": "com.example.app",
  "appName": "My App",
  "serverType": "self-hosted",
  "serverUrl": "http://localhost:3000",
  "platforms": ["android", "ios"],
  "bundleName": "main.lynx.bundle",
  "distDir": "dist",
  "deploymentKeys": {
    "android": {
      "staging": "xxx",
      "production": "xxx"
    },
    "ios": {
      "staging": "xxx",
      "production": "xxx"
    }
  }
}
```

## 📱 Client SDK API

### Android (Kotlin)

```kotlin
// Check for updates
LynxHotUpdate.checkForUpdate { result ->
    if (result.updateAvailable) {
        // Download update
        LynxHotUpdate.downloadUpdate(
            result,
            onProgress = { progress -> 
                // Progress 0-100
            },
            onComplete = { success, error ->
                if (success) {
                    // Update will apply on next launch
                }
            }
        )
    }
}

// Get current version
val version = LynxHotUpdate.getCurrentVersion()

// Clear all updates (revert to bundled version)
LynxHotUpdate.clearUpdates()
```

### iOS (Swift)

```swift
// Check for updates
LynxHotUpdate.shared.checkForUpdate { result in
    if result.updateAvailable {
        // Download update
        LynxHotUpdate.shared.downloadUpdate(result,
            onProgress: { progress in
                // Progress 0-100
            },
            completion: { success, error in
                if success {
                    // Update will apply on next launch
                }
            }
        )
    }
}

// Get current version
let version = LynxHotUpdate.shared.getCurrentVersion()

// Clear all updates
LynxHotUpdate.shared.clearUpdates()
```

## 🏗 Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Lynx App      │     │  Update Server  │
│  ┌───────────┐  │     │  ┌───────────┐  │
│  │    SDK    │◄─┼─────┼─►│    API    │  │
│  └───────────┘  │     │  └───────────┘  │
│        │        │     │        │        │
│  ┌───────────┐  │     │  ┌───────────┐  │
│  │  Bundle   │  │     │  │  Bundles  │  │
│  │  Loader   │  │     │  │  Storage  │  │
│  └───────────┘  │     │  └───────────┘  │
└─────────────────┘     └─────────────────┘
```

### Update Flow

1. **Check Update**: App queries server for new version on launch
2. **Download Bundle**: If update available, download new Bundle in background
3. **Verify Integrity**: SHA256 hash verification ensures package is not tampered
4. **Install Update**: Extract to pending update directory
5. **Apply Update**: Load new Bundle on next app launch

## 🆚 Comparison

| Feature | CodePush | Lynx Hot Update |
|---------|----------|-----------------|
| Framework | React Native | Lynx |
| Self-hosted | ❌ Requires App Center | ✅ Fully self-hosted |
| Gradual Rollout | ✅ | ✅ |
| Mandatory Updates | ✅ | ✅ |
| Rollback | ✅ | ✅ |
| Open Source | Partial | ✅ Fully open source |

## 🤝 Contributing

Issues and PRs are welcome!

## 📄 License

MIT License

---

**Make Lynx app updates as simple as CodePush!**
