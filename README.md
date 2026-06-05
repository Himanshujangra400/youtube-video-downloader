# YouTube Clip Downloader (HS.DV)

A fast, professional-grade **Electron desktop application** for downloading YouTube clips and full videos using **yt-dlp**. Download with time-range clipping, batch processing, multiple quality options, and real-time progress tracking.

## Features

✅ **Fast Downloads** – Optimized yt-dlp settings with parallel fragment downloading  
✅ **Time-Range Clipping** – Extract only the part you need from a video  
✅ **Batch Downloads** – Download multiple clips simultaneously  
✅ **Quality Selection** – Best, 1080p, 720p, 480p, or Audio-only (MP3)  
✅ **Real-Time Progress** – Live download speed, ETA, and percentage  
✅ **Re-Download Support** – Download the same video multiple times with unique filenames  
✅ **Dark Industrial UI** – Professional monospace interface built with Electron  
✅ **External Downloader Support** – Optional aria2c integration for faster downloads  
✅ **Per-Clip Labels** – Custom filename prefixes for easy organization  
✅ **Open Folder Integration** – Quickly browse downloaded clips  

## Getting Started (Step-by-Step)

### Step 1: Install Required Software

Before you start, you need to install 3 things on your computer:

#### **A) Node.js** (Required for running the app)

1. Go to https://nodejs.org/
2. Download **LTS version** (Long Term Support)
3. Run the installer and follow the setup wizard
4. After installation, open PowerShell/Terminal and verify:
   ```bash
   node --version
   npm --version
   ```
   You should see version numbers (e.g., v18.0.0)

#### **B) yt-dlp** (Required for downloading videos)

**Windows (Easiest - Using Chocolatey):**
```powershell
# If you have Chocolatey installed
choco install yt-dlp
```

**OR Download Manually:**
1. Go to https://github.com/yt-dlp/yt-dlp/releases
2. Download `yt-dlp.exe`
3. Place it in `C:\Users\YOUR_USERNAME\AppData\Local\Programs\yt-dlp\` and add to PATH
4. Verify: Open PowerShell and type:
   ```bash
   yt-dlp --version
   ```

**macOS:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
sudo apt-get update
sudo apt-get install yt-dlp
```

#### **C) ffmpeg** (Required for video processing)

**Windows (Using Chocolatey):**
```powershell
choco install ffmpeg
```

**OR Download Manually:**
1. Go to https://ffmpeg.org/download.html
2. Download Windows version
3. Extract and add to PATH

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

**Verify all three are installed:**
```bash
node --version      # Should show v14+
npm --version       # Should show 6+
yt-dlp --version    # Should show version number
ffmpeg -version     # Should show version info
```

---

### Step 2: Clone/Download the Project

**Option A: Using Git (Recommended)**

1. Open PowerShell/Terminal
2. Choose where to save the project
3. Run:
   ```bash
   git clone https://github.com/YOUR_USERNAME/youtube-clip-downloader.git
   cd youtube-clip-downloader
   ```

**Option B: Download as ZIP**

1. Go to https://github.com/YOUR_USERNAME/youtube-clip-downloader
2. Click **Code** → **Download ZIP**
3. Extract the ZIP file to a folder
4. Open PowerShell/Terminal in that folder

---

### Step 3: Install Dependencies

Once you're in the project folder, run:

```bash
npm install
```

This will download Electron and other required packages (takes 1-2 minutes).

You should see a `node_modules` folder created and a message like:
```
added 123 packages in 45s
```

---

### Step 4: Start the App

Run this command:

```bash
npm start
```

The app window will open in 3-5 seconds. You're ready to use it!

**Note:** If the window doesn't open, check for error messages in PowerShell and ensure Node.js is installed.

---

### Step 5: (Optional) Install aria2c for Faster Downloads

aria2c allows parallel downloads (faster speed):

**Windows:**
```powershell
choco install aria2
```

**macOS:**
```bash
brew install aria2
```

**The app will auto-detect aria2c and use it if available.**

---

## How to Use

### Basic Workflow

1. **Select Output Folder**
   - Click **"Browse"** button to choose where downloads will be saved
   - The folder path will appear in the "Output folder" field

2. **Add a Clip**
   - Click **"Add Clip"** to create a new download entry
   - A clip card will appear with input fields

3. **Fill in the Clip Details**
   - **YouTube URL**: Paste the full YouTube video link (e.g., `https://www.youtube.com/watch?v=...`)
   - **Label / filename** (optional): Enter a custom prefix for the filename
   - **Quality**: Select from Best (4K), 1080p, 720p, 480p, or Audio only
   - **Start / End time**: Use the range sliders or type times manually (MM:SS format)

4. **Optional: Use Time Range**
   - Check the **"Use time range"** checkbox to enable clipping
   - Adjust the interactive timeline or enter exact start/end times
   - The app will download only the selected segment (faster than downloading the full video)

5. **Download the Clip**
   - Click **"Download"** on a single clip card, or **"Download All"** to batch process multiple clips
   - Watch the real-time progress: percentage, speed (MiB/s), and ETA
   - Status badge shows: **Waiting → Downloading → Done** or **Error**

6. **View Downloaded Files**
   - Once complete, click **"Open Folder"** to quickly browse the downloaded file

### Advanced Features

#### Batch Downloading

- Add multiple clips with different URLs, qualities, and time ranges
- Click **"Download All"** at the bottom to process all clips at once
- Each clip downloads independently with its own progress tracking

#### Time Range Extraction

- Enable **"Use time range"** on any clip
- Use the interactive timeline slider or enter precise MM:SS times
- Downloads only the selected segment (faster startup for clips)
- Clipped files save with `_clip` suffix to avoid collisions

#### Re-Download Same Video

- The app allows downloading the same YouTube URL multiple times
- Each download gets a **unique filename** (includes a timestamp suffix)
- No need to change the label each time—both files will save successfully

#### Custom Filename Labels

- Each clip can have a custom label (e.g., "Intro", "Tutorial", "Remix")
- Labels become the filename prefix: `Label_[VideoID]_[Timestamp].mp4`
- Keep labels short for easier organization

#### Audio Extraction

- Select **"Audio only (MP3)"** quality
- The app extracts audio and saves as MP3 file automatically

## File Structure

```
youtube-video-downloader/
├── main.js                 # Electron main process (spawn yt-dlp, IPC handlers)
├── preload.js             # Secure IPC bridge to renderer
├── renderer.js            # Frontend UI logic and event handlers
├── index.html             # UI template
├── styles.css             # Dark industrial styling
├── package.json           # Node.js dependencies & scripts
└── README.md              # This file
```

### Optional Binaries

Place these in the project folder for **local** use (instead of using PATH):

- `yt-dlp.exe` – yt-dlp executable
- `ffmpeg.exe` – ffmpeg executable
- `aria2c.exe` – aria2 downloader (optional, for parallel downloads)

## Settings & Optimization

### Download Speed Tuning

The app uses optimized yt-dlp settings for both full videos and time-range clips:

- **Full Videos**: Parallel fragment downloading (10 concurrent), 64K buffer, 16M chunks, aria2c support
- **Time-Range Clips**: Lean settings, IPv4-only, Android player client for faster startup
- **All Downloads**: Automatic progress parsing, retry logic, socket timeout resilience

### Quality Formats

- **Best (4K)**: `best[ext=mp4]/best` – Highest available quality
- **1080p**: Best video ≤1080p + best audio
- **720p**: Best video ≤720p + best audio
- **480p**: Best video ≤480p + best audio
- **Audio only**: `bestaudio/best` → extracted as MP3

### Filename Pattern

Downloaded files follow this template:

```
[Label or Title]_[VideoID]_[RequestTimestamp][_clip if range used].mp4
```

Example:
- Full download: `MyVideo_[dQw4w9WgXcQ]_a1b2c3d4.mp4`
- Clipped download: `MyVideo_[dQw4w9WgXcQ]_a1b2c3d4_clip.mp4`

## Troubleshooting

### "Failed to start yt-dlp" Error

- Ensure yt-dlp is installed and in your PATH
- Or place `yt-dlp.exe` in the project root directory
- Test in terminal: `yt-dlp --version`

### Videos Not Appearing in Folder

- Verify the output folder was selected (should show in the topbar)
- Check download status; look for error messages in the UI
- Ensure the folder has write permissions

### Slow Downloads

- Download speed depends on YouTube server availability and your internet connection
- For faster downloads, install aria2c (app auto-detects it)
- Time-range clips may take longer due to YouTube's segment extraction

### "Same video won't re-download"

- The app adds a unique timestamp to each filename to prevent collisions
- Each download should save as a separate file
- If still blocked, try changing the label slightly

### ffmpeg Warnings/Errors

- Ensure ffmpeg is installed: `ffmpeg -version`
- Place `ffmpeg.exe` in the project root if using local binaries

## Advanced: Running from Source

If you want to modify the code:

1. Edit `main.js`, `renderer.js`, or `index.html` as needed
2. Stop the app (close the window) and run `npm start` again
3. Electron will reload with your changes

### Key Files to Customize

- **Branding**: Change "HS.DV" and colors in `index.html` and `styles.css`
- **Download Logic**: Modify `buildYtDlpArgs()` in `main.js` for custom yt-dlp settings
- **UI Styling**: Update CSS variables and classes in `styles.css` for dark/light themes

## Technology Stack

- **Electron** – Desktop framework (Chromium + Node.js)
- **yt-dlp** – YouTube downloader (command-line)
- **ffmpeg** – Video codec/format conversion
- **JavaScript (ES6+)** – Frontend and backend logic
- **HTML5 + CSS3** – UI and styling
- **Node.js child_process** – Spawn and manage yt-dlp processes

## Performance Notes

- **Progress Updates**: Real-time parsing of yt-dlp output (stdout/stderr)
- **Parallel Fragments**: For full videos, up to 10 concurrent chunk downloads
- **Startup Delay**: Time-range clips use a faster, leaner yt-dlp path for quicker startup
- **Memory**: Efficient streaming; large video files are not buffered entirely in memory

## License & Credits

**YouTube Clip Downloader (HS.DV)**

- Built with [Electron](https://www.electronjs.org/)
- Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Video processing with [ffmpeg](https://ffmpeg.org/)

Free to use for personal and non-commercial purposes. Respect YouTube's Terms of Service when downloading content.

---

## Quick Start Commands

```bash
# Clone/Extract project
cd youtube-video-downloader

# Install dependencies
npm install

# Start the app
npm start

# (Optional) Install yt-dlp & ffmpeg if not already on system
# Windows: choco install yt-dlp ffmpeg
# macOS: brew install yt-dlp ffmpeg
# Linux: sudo apt-get install yt-dlp ffmpeg
```

---

**Questions or Issues?**  
Check the troubleshooting section above or verify yt-dlp/ffmpeg are correctly installed and in your PATH.

Happy downloading! 🎬
