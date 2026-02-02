# Mobile Testing Setup with Android Studio

This guide covers how to test the GitHub Web Publish plugin on Android using Android Studio's emulator.

## Prerequisites

- Android Studio installed ([download](https://developer.android.com/studio))
- Google account (for Play Store access)
- Built plugin (`main.js`, `manifest.json`, `styles.css`)

## Step 1: Install Android Studio

If not already installed:

```bash
# Ubuntu/Debian
sudo snap install android-studio --classic

# Or download from https://developer.android.com/studio
```

## Step 2: Create an Android Virtual Device (AVD)

1. Open Android Studio
2. Go to **Tools → Device Manager** (or click the device icon in toolbar)
3. Click **Create Device**
4. Select a device (e.g., **Pixel 6** or **Pixel 7**)
5. Click **Next**
6. Select a system image:
   - Choose **API 33** or higher (Android 13+)
   - Select an image with **Google Play** (look for the Play Store icon)
   - Click **Download** if needed, then **Next**
7. Name your AVD (e.g., "Obsidian Testing")
8. Click **Finish**

## Step 3: Start the Emulator

1. In Device Manager, click the **Play** button next to your AVD
2. Wait for the emulator to boot (first boot takes longer)
3. Complete Android setup wizard if prompted

## Step 4: Sign into Google Play Store

1. Open the **Play Store** app on the emulator
2. Sign in with a Google account
3. Accept terms and conditions

## Step 5: Install Obsidian

1. In Play Store, search for **"Obsidian"**
2. Install the app (by Dynalist Inc.)
3. Open Obsidian once installed

## Step 6: Set Up a Test Vault

### Option A: Create a New Vault (Simplest)

1. Open Obsidian on emulator
2. Tap **Create new vault**
3. Name it (e.g., "Test Vault")
4. Create the required folder structure:
   ```
   _www/sites/test-site/
   ├── unpublished/
   ├── ready-to-publish-now/
   ├── ready-to-publish-scheduled/
   └── published/
   ```

### Option B: Use ADB to Push Files

Push files from your computer to the emulator:

```bash
# Find the vault location (usually in Documents or Obsidian folder)
adb shell ls /sdcard/

# Push your test vault
adb push /path/to/test-vault /sdcard/Documents/TestVault

# Or push individual files
adb push test-note.md /sdcard/Documents/TestVault/
```

## Step 7: Install the Plugin

### Method 1: Manual Installation via ADB (Recommended)

1. Build the plugin:
   ```bash
   cd /home/jon/code/playground/obsidian-github-web-publish
   npm run build
   ```

2. Create plugin directory and push files:
   ```bash
   # Find your vault path (adjust as needed)
   VAULT_PATH="/sdcard/Documents/Obsidian/TestVault"

   # Create plugin directory
   adb shell mkdir -p "$VAULT_PATH/.obsidian/plugins/github-web-publish"

   # Push plugin files
   adb push main.js "$VAULT_PATH/.obsidian/plugins/github-web-publish/"
   adb push manifest.json "$VAULT_PATH/.obsidian/plugins/github-web-publish/"
   adb push styles.css "$VAULT_PATH/.obsidian/plugins/github-web-publish/"
   ```

3. In Obsidian mobile:
   - Go to **Settings → Community plugins**
   - Enable **Community plugins** if prompted
   - Find and enable **GitHub Web Publish**

### Method 2: Via BRAT Plugin

1. Install BRAT plugin from Community Plugins
2. Add beta plugin via GitHub URL
3. Enable the plugin

## Step 8: Configure the Plugin

1. Go to **Settings → GitHub Web Publish**
2. Authenticate with GitHub (Device Flow should work on mobile)
3. Configure your test site:
   - Vault path: `_www/sites/test-site`
   - GitHub repo: `your-username/your-repo`
   - Other settings as needed

## Step 9: Run Tests

### Test Checklist

- [ ] **Authentication**: Device Flow login works
- [ ] **Publish**: Move file to `ready-to-publish-now/` triggers publish
- [ ] **Scheduled**: Move to `ready-to-publish-scheduled/` creates PR with label
- [ ] **Unpublish**: Move from `published/` to `unpublished/` removes post
- [ ] **Images**: Embedded images are uploaded correctly
- [ ] **Activity Log**: Log file updates correctly
- [ ] **Status Bar**: Shows connection status
- [ ] **Commands**: Command palette commands work
- [ ] **Settings**: All settings accessible and saveable
- [ ] **Error Handling**: Network errors show proper messages
- [ ] **Retry**: Transient failures retry automatically

## Useful ADB Commands

```bash
# List connected devices
adb devices

# Open shell on device
adb shell

# View Obsidian logs (filter by app)
adb logcat | grep -i obsidian

# Pull files from device
adb pull /sdcard/Documents/TestVault/file.md ./

# Push updated plugin
adb push main.js /sdcard/Documents/Obsidian/TestVault/.obsidian/plugins/github-web-publish/

# Restart Obsidian (force stop)
adb shell am force-stop md.obsidian

# Start Obsidian
adb shell am start -n md.obsidian/.MainActivity
```

## Quick Plugin Update Script

Create a script for rapid iteration:

```bash
#!/bin/bash
# update-mobile-plugin.sh

VAULT_PATH="/sdcard/Documents/Obsidian/TestVault"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/github-web-publish"

# Build
npm run build

# Push updated files
adb push main.js "$PLUGIN_DIR/"
adb push manifest.json "$PLUGIN_DIR/"
adb push styles.css "$PLUGIN_DIR/"

# Restart Obsidian
adb shell am force-stop md.obsidian
sleep 1
adb shell am start -n md.obsidian/.MainActivity

echo "Plugin updated and Obsidian restarted"
```

## Troubleshooting

### Emulator Won't Start
- Ensure virtualization is enabled in BIOS (VT-x/AMD-V)
- Check Android Studio → SDK Manager → SDK Tools → Intel HAXM is installed

### Play Store Not Available
- Make sure you selected a system image with Google Play APIs
- Try a different API level (33 or 34 recommended)

### ADB Not Found
```bash
# Add to PATH
export PATH=$PATH:~/Android/Sdk/platform-tools

# Or use full path
~/Android/Sdk/platform-tools/adb devices
```

### Plugin Not Appearing
- Verify files are in correct location: `.obsidian/plugins/github-web-publish/`
- Check `manifest.json` exists and is valid JSON
- Restart Obsidian completely
- Check Community plugins is enabled in settings

### Network Issues in Emulator
- Check emulator has internet: open Chrome, visit a website
- Try cold boot: Device Manager → ⋮ → Cold Boot Now
- Check proxy settings in emulator's Settings → Network

## iOS Testing

For iOS testing, you would need:
- macOS with Xcode
- iOS Simulator
- Similar process but with different paths

Note: Obsidian on iOS uses iCloud or local storage, which is more complex to access from the simulator.
