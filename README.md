# 🔥 Lynx Hot Update

**🌐 Language / 语言**: [中文](#) | [English](./README.en.md)

> Lynx 应用热更新解决方案 - 无需应用商店审核即可推送更新
>
> OTA updates for Lynx apps - Push updates without app store review

像 CodePush 一样简单的 Lynx 热更新工具！

## 📦 安装

```bash
npm install -g lynx-hot-update
```

> ⚠️ **前提条件**: 需要先使用 `lynx-native-cli` 创建原生项目

## ✨ 特性

- 🚀 **即时更新**: 绕过应用商店，直接推送 JS Bundle 更新
- 🔄 **增量更新**: 只下载变更的内容，节省流量
- 🔐 **安全校验**: SHA256 哈希验证，确保包完整性
- 📊 **灰度发布**: 支持按比例逐步推送更新
- ⏪ **一键回滚**: 出问题时快速回退到上一版本
- 🔑 **部署密钥**: 区分 Staging 和 Production 环境
- 📱 **多平台**: 同时支持 Android 和 iOS

## 🚀 快速开始

### 1. 初始化热更新

```bash
cd your-lynx-project
lynx-update init
```

### 2. 集成 SDK

#### Android

在 `Application` 类中初始化：

```kotlin
import com.lynx.hotupdate.LynxHotUpdate
import com.lynx.hotupdate.HotUpdateTemplateProvider

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // 初始化热更新
        LynxHotUpdate.init(
            this,
            "your-deployment-key",
            "https://your-update-server.com"
        )
        
        // 使用热更新 TemplateProvider
        LynxEnv.inst().setTemplateProvider(HotUpdateTemplateProvider(this))
    }
}
```

#### iOS

在 `AppDelegate` 中初始化：

```swift
import LynxHotUpdate

func application(_ application: UIApplication, didFinishLaunchingWithOptions...) {
    // 初始化热更新
    LynxHotUpdate.shared.initialize(
        deploymentKey: "your-deployment-key",
        serverUrl: "https://your-update-server.com"
    )
}
```

### 3. 发布更新

```bash
# 构建 Lynx 应用
npm run build

# 发布更新
lynx-update publish --version 1.0.1 --description "Bug fixes"
```

## 📋 命令参考

### 初始化

```bash
lynx-update init                    # 初始化热更新配置
lynx-update init --server <url>     # 指定更新服务器
```

### 发布更新

```bash
lynx-update publish                           # 发布到所有平台
lynx-update publish -p android                # 只发布到 Android
lynx-update publish -v 1.0.1                  # 指定版本号
lynx-update publish -d "修复了一些问题"         # 添加更新说明
lynx-update publish --mandatory               # 强制更新
lynx-update publish --rollout 50              # 灰度发布 50%
lynx-update publish --diff                    # 启用差分更新（只上传变更）
lynx-update publish --target-binary-version ">=1.0.0"  # 版本定向
```

### 回滚

```bash
lynx-update rollback                          # 交互式选择版本回滚
lynx-update rollback -v 1.0.0                 # 回滚到指定版本
lynx-update rollback -p android               # 只回滚 Android
```

### 查看状态

```bash
lynx-update status                            # 查看部署状态
lynx-update status -p android                 # 查看 Android 状态
```

### 发布历史

```bash
lynx-update history                           # 查看发布历史
lynx-update history -p android                # 查看 Android 历史
lynx-update history -n 20                     # 显示最近 20 条
lynx-update history -v                        # 显示详细描述
```

### 修改发布

```bash
lynx-update patch 1.0.1 --disabled true       # 禁用某个版本
lynx-update patch 1.0.1 --disabled false      # 启用某个版本
lynx-update patch 1.0.1 --rollout 50          # 修改灰度比例
lynx-update patch 1.0.1 --mandatory true      # 设为强制更新
```

### 环境推送

```bash
lynx-update promote                           # Staging → Production
lynx-update promote -s staging -t production  # 指定源和目标环境
lynx-update promote --rollout 10              # 推送后灰度 10%
```

### 配置管理

```bash
lynx-update config --show                     # 显示当前配置
lynx-update config --server <url>             # 修改服务器地址
```

### 启动服务器

```bash
lynx-update server                            # 启动热更新服务器
lynx-update server -p 8080                    # 指定端口
lynx-update server -d ./data                  # 指定数据目录
```

## 🔧 配置文件

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

## 📱 客户端 SDK API

### Android (Kotlin)

```kotlin
// 检查更新
LynxHotUpdate.checkForUpdate { result ->
    if (result.updateAvailable) {
        // 下载更新
        LynxHotUpdate.downloadUpdate(
            result,
            onProgress = { progress -> 
                // 更新进度 0-100
            },
            onComplete = { success, error ->
                if (success) {
                    // 更新将在下次启动时生效
                }
            }
        )
    }
}

// 获取当前版本
val version = LynxHotUpdate.getCurrentVersion()

// 清除所有更新（回退到内置版本）
LynxHotUpdate.clearUpdates()

// 标记更新成功（防止自动回滚）
LynxHotUpdate.notifyUpdateSuccess()

// 标记更新失败（触发自动回滚）
LynxHotUpdate.notifyUpdateFailed()

// 立即重启应用
LynxHotUpdate.restartApp()
```

### iOS (Swift)

```swift
// 检查更新
LynxHotUpdate.shared.checkForUpdate { result in
    if result.updateAvailable {
        // 下载更新
        LynxHotUpdate.shared.downloadUpdate(result,
            onProgress: { progress in
                // 更新进度 0-100
            },
            completion: { success, error in
                if success {
                    // 更新将在下次启动时生效
                }
            }
        )
    }
}

// 获取当前版本
let version = LynxHotUpdate.shared.getCurrentVersion()

// 清除所有更新
LynxHotUpdate.shared.clearUpdates()
```

## 🏗 架构说明

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

### 更新流程

1. **检查更新**: App 启动时向服务器查询是否有新版本
2. **下载 Bundle**: 如有更新，后台下载新的 Bundle 包
3. **校验完整性**: SHA256 哈希验证确保包未被篡改
4. **安装更新**: 解压到待更新目录
5. **应用更新**: 下次启动时加载新 Bundle

## 🆚 对比

| 功能 | CodePush | Lynx Hot Update |
|------|----------|-----------------|
| 支持框架 | React Native | Lynx |
| 自托管 | ❌ 需要 App Center | ✅ 完全自托管 |
| 灰度发布 | ✅ | ✅ |
| 强制更新 | ✅ | ✅ |
| 回滚 | ✅ | ✅ |
| 开源 | 部分 | ✅ 完全开源 |

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 协议

MIT License

---

**让 Lynx 应用更新像 CodePush 一样简单！**
