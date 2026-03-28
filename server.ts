import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Parser from "rss-parser";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf-8"));

const app = express();
const PORT = 3000;

// Ensure directories exist
const MEDIA_DIR = path.join(__dirname, "public", "media");
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Serve media files
app.use("/media", express.static(MEDIA_DIR));

const parser = new Parser();

const RSS_FEEDS = [
  { name: "Google News World", url: "https://news.google.com/rss/search?q=world&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Technology", url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Business", url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Sports", url: "https://news.google.com/rss/search?q=sports&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Entertainment", url: "https://news.google.com/rss/search?q=entertainment&hl=en-US&gl=US&ceid=US:en" },
];

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API: Merge Audio and Video/Image
app.post("/api/merge-video", async (req, res) => {
  const { audioUrl, mediaUrl, articleId, lang, isImage } = req.body;
  if (!audioUrl || !mediaUrl || !articleId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const outputFilename = `news-${articleId}-${lang}-${Date.now()}.mp4`;
  const outputPath = path.join(MEDIA_DIR, outputFilename);
  
  // Temporary file paths to avoid ENAMETOOLONG
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const audioTempPath = path.join(tempDir, `audio-${articleId}-${Date.now()}.mp3`);
  const mediaTempPath = path.join(tempDir, `media-${articleId}-${Date.now()}${isImage ? '.png' : '.mp4'}`);

  try {
    // Helper to save data URL to file
    const saveDataUrlToFile = (dataUrl: string, filePath: string) => {
      const base64Data = dataUrl.split(";base64,").pop();
      if (!base64Data) throw new Error("Invalid data URL");
      fs.writeFileSync(filePath, base64Data, { encoding: "base64" });
    };

    saveDataUrlToFile(audioUrl, audioTempPath);
    saveDataUrlToFile(mediaUrl, mediaTempPath);

    let command = ffmpeg();

    if (isImage) {
      // Handle Image + Audio
      command
        .input(mediaTempPath)
        .inputOptions("-loop 1")
        .input(audioTempPath)
        .outputOptions("-c:v libx264") // Encode image to video
        .outputOptions("-tune stillimage")
        .outputOptions("-c:a aac")
        .outputOptions("-b:a 192k")
        .outputOptions("-pix_fmt yuv420p")
        .outputOptions("-shortest");
    } else {
      // Handle Video + Audio
      command
        .input(mediaTempPath)
        .input(audioTempPath)
        .outputOptions("-c:v copy") // Copy video stream
        .outputOptions("-c:a aac")   // Encode audio to AAC
        .outputOptions("-map 0:v:0") // Take first video stream from first input
        .outputOptions("-map 1:a:0") // Take first audio stream from second input
        .outputOptions("-shortest");
    }

    const cleanup = () => {
      try {
        if (fs.existsSync(audioTempPath)) fs.unlinkSync(audioTempPath);
        if (fs.existsSync(mediaTempPath)) fs.unlinkSync(mediaTempPath);
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };

    command
      .on("start", (cmd) => console.log("FFmpeg started:", cmd))
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        cleanup();
        res.status(500).json({ error: err.message });
      })
      .on("end", async () => {
        console.log("FFmpeg finished");
        cleanup();
        const publicUrl = `/media/${outputFilename}`;
        res.json({ status: "success", videoUrl: publicUrl });
      })
      .save(outputPath);
  } catch (error) {
    console.error("Error merging media:", error);
    // Cleanup if write failed
    try {
      if (fs.existsSync(audioTempPath)) fs.unlinkSync(audioTempPath);
      if (fs.existsSync(mediaTempPath)) fs.unlinkSync(mediaTempPath);
    } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// API: Fetch RSS News (Proxy to avoid CORS and handle parsing)
app.get("/api/fetch-rss", async (req, res) => {
  try {
    const allItems = [];
    for (const feed of RSS_FEEDS) {
      try {
        const feedData = await parser.parseURL(feed.url);
        for (const item of feedData.items.slice(0, 10)) {
          allItems.push({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate || new Date().toISOString(),
            contentSnippet: item.contentSnippet || "",
            source: feed.name,
          });
        }
      } catch (feedError) {
        console.error(`Error fetching feed ${feed.name}:`, feedError.message);
      }
    }
    res.json({ status: "success", items: allItems });
  } catch (error) {
    console.error("Error fetching RSS:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Global Error Handler for API routes
app.use("/api", (err: any, req: any, res: any, next: any) => {
  console.error("API Global Error:", err);
  res.status(500).json({ status: "error", message: err.message || "Internal Server Error" });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
