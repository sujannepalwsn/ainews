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

import { initializeApp as initializeAdminApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin
const adminApp = getApps().length === 0 
  ? initializeAdminApp({
      projectId: firebaseConfig.projectId,
    })
  : getApp();

const db = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

// Test Firestore connection at startup
(async () => {
  try {
    console.log(`Testing Firestore connection. Project: ${firebaseConfig.projectId}, Database: ${firebaseConfig.firestoreDatabaseId}`);
    
    // Try named database
    try {
      const snapshot = await db.collection("raw_news").limit(1).get();
      console.log("Named database connection successful. Docs:", snapshot.size);
    } catch (namedError) {
      console.error("Named database access failed:", namedError.message);
      
      // Fallback/Diagnostic: Try default database
      try {
        const defaultDb = getAdminFirestore(adminApp);
        const defaultSnapshot = await defaultDb.collection("raw_news").limit(1).get();
        console.log("Default database access successful (fallback). Docs:", defaultSnapshot.size);
        // If default works but named doesn't, we might be using the wrong database ID
      } catch (defaultError) {
        console.error("Default database access also failed:", defaultError.message);
      }
    }
  } catch (error) {
    console.error("CRITICAL: Firestore diagnostic failed.");
    console.error("Error details:", error);
  }
})();

const parser = new Parser();

const RSS_FEEDS = [
  { name: "Google News World", url: "https://news.google.com/rss/search?q=world&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Technology", url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Business", url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Sports", url: "https://news.google.com/rss/search?q=sports&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News Entertainment", url: "https://news.google.com/rss/search?q=entertainment&hl=en-US&gl=US&ceid=US:en" },
];

app.use(express.json());

// API: Merge Audio and Video/Image
app.post("/api/merge-video", async (req, res) => {
  const { audioUrl, mediaUrl, articleId, lang, isImage } = req.body;
  if (!audioUrl || !mediaUrl || !articleId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const outputFilename = `news-${articleId}-${lang}-${Date.now()}.mp4`;
  const outputPath = path.join(MEDIA_DIR, outputFilename);

  try {
    let command = ffmpeg();

    if (isImage) {
      // Handle Image + Audio
      command
        .input(mediaUrl)
        .inputOptions("-loop 1")
        .input(audioUrl)
        .outputOptions("-c:v libx264") // Encode image to video
        .outputOptions("-tune stillimage")
        .outputOptions("-c:a aac")
        .outputOptions("-b:a 192k")
        .outputOptions("-pix_fmt yuv420p")
        .outputOptions("-shortest");
    } else {
      // Handle Video + Audio
      command
        .input(mediaUrl)
        .input(audioUrl)
        .outputOptions("-c:v copy") // Copy video stream
        .outputOptions("-c:a aac")   // Encode audio to AAC
        .outputOptions("-map 0:v:0") // Take first video stream from first input
        .outputOptions("-map 1:a:0") // Take first audio stream from second input
        .outputOptions("-shortest");
    }

    command
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
    console.error("Error merging media:", error);
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
