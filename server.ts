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

import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin (uses default credentials in Cloud Run)
const adminApp = initializeAdminApp({
  projectId: firebaseConfig.projectId,
});
const db = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

const parser = new Parser();

const RSS_FEEDS = [
  { name: "Google News World", url: "https://news.google.com/rss/search?q=world&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Technology", url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Business", url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Sports", url: "https://news.google.com/rss/search?q=sports&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Entertainment", url: "https://news.google.com/rss/search?q=entertainment&hl=en-US&gl=US&ceid=US:en" },
];

app.use(express.json());

// API: Merge Audio and Video
app.post("/api/merge-video", async (req, res) => {
  const { audioUrl, videoUrl, articleId, lang } = req.body;
  if (!audioUrl || !videoUrl || !articleId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const outputFilename = `news-${articleId}-${lang}-${Date.now()}.mp4`;
  const outputPath = path.join(MEDIA_DIR, outputFilename);

  try {
    // We need to download the files first or pass URLs directly if FFmpeg supports it
    // FFmpeg usually supports URLs directly
    ffmpeg()
      .input(videoUrl)
      .input(audioUrl)
      .outputOptions("-c:v copy") // Copy video stream
      .outputOptions("-c:a aac")   // Encode audio to AAC
      .outputOptions("-map 0:v:0") // Take first video stream from first input
      .outputOptions("-map 1:a:0") // Take first audio stream from second input
      .outputOptions("-shortest")  // End when the shortest stream ends
      .on("start", (cmd) => console.log("FFmpeg started:", cmd))
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        res.status(500).json({ error: err.message });
      })
      .on("end", async () => {
        console.log("FFmpeg finished");
        const publicUrl = `/media/${outputFilename}`;
        
        // Update article with video URL
        const articleRef = db.collection("articles").doc(articleId);
        await articleRef.update({
          videoUrl: publicUrl,
          videoGeneratedAt: FieldValue.serverTimestamp()
        });

        res.json({ status: "success", videoUrl: publicUrl });
      })
      .save(outputPath);
  } catch (error) {
    console.error("Error merging video:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Trigger News Collection
app.post("/api/collect-news", async (req, res) => {
  try {
    const results = [];
    for (const feed of RSS_FEEDS) {
      const feedData = await parser.parseURL(feed.url);
      for (const item of feedData.items.slice(0, 5)) { // Limit to 5 per feed for now
        // Check if already exists
        const snapshot = await db.collection("raw_news").where("link", "==", item.link).get();
        
        if (snapshot.empty) {
          await db.collection("raw_news").add({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate || new Date().toISOString(),
            contentSnippet: item.contentSnippet || "",
            source: feed.name,
            processed: false,
            createdAt: FieldValue.serverTimestamp(),
          });
          results.push({ title: item.title, status: "added" });
        } else {
          results.push({ title: item.title, status: "skipped" });
        }
      }
    }
    res.json({ status: "success", results });
  } catch (error) {
    console.error("Error collecting news:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
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
