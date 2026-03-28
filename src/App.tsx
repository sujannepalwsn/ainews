import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate } from "react-router-dom";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { db, auth } from "./firebase";
import { 
  Newspaper, 
  Globe, 
  TrendingUp, 
  Cpu, 
  Briefcase, 
  HeartPulse, 
  FlaskConical, 
  Trophy, 
  Clapperboard, 
  GraduationCap, 
  Leaf, 
  ShieldAlert, 
  Smile, 
  Settings, 
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Languages,
  Menu,
  X,
  Loader2,
  Video,
  Play,
  Download,
  Key
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";


// --- Types ---
interface Article {
  id: string;
  headline: string;
  summary: string;
  content: string;
  highlights: string[];
  category: string;
  language: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: any;
  slug: string;
  originalId: string;
  videoUrl?: string;
  videoGeneratedAt?: any;
}

interface RawNews {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
  processed: boolean;
}

// --- Constants ---
const CATEGORIES = [
  { id: "politics", name: "राजनीति", en: "Politics", icon: Globe },
  { id: "business", name: "व्यवसाय", en: "Business", icon: Briefcase },
  { id: "technology", name: "प्रविधि", en: "Technology", icon: Cpu },
  { id: "health", name: "स्वास्थ्य", en: "Health", icon: HeartPulse },
  { id: "science", name: "विज्ञान", en: "Science", icon: FlaskConical },
  { id: "sports", name: "खेलकुद", en: "Sports", icon: Trophy },
  { id: "entertainment", name: "मनोरञ्जन", en: "Entertainment", icon: Clapperboard },
  { id: "education", name: "शिक्षा", en: "Education", icon: GraduationCap },
  { id: "environment", name: "वातावरण", en: "Environment", icon: Leaf },
  { id: "crime", name: "अपराध", en: "Crime", icon: ShieldAlert },
  { id: "lifestyle", name: "जीवनशैली", en: "Lifestyle", icon: Smile },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ne", name: "नेपाली" },
  { code: "hi", name: "हिन्दी" },
];

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} on ${parsed.path})`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-red-100">
            <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const ADMIN_EMAIL = "sujan1nepal.wsn@gmail.com";

const Navbar = ({ user, lang, setLang }: { user: User | null, lang: string, setLang: (l: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-blue-600 p-2 rounded-lg group-hover:rotate-12 transition-transform">
              <Newspaper className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">Global News AI</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-full">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium transition-all",
                    lang === l.code ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  {l.name}
                </button>
              ))}
            </div>
            {user ? (
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-gray-200" />
                <button onClick={() => signOut(auth)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign Out</button>
                {isAdmin && (
                  <Link to="/admin" className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 transition-all">
                    <Settings className="w-4 h-4" />
                    Admin
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-500">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-200 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLang(l.code); setIsOpen(false); }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium border",
                      lang === l.code ? "bg-blue-50 border-blue-200 text-blue-600" : "border-gray-200 text-gray-600"
                    )}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              {user ? (
                <div className="flex flex-col gap-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-10 h-10 rounded-full" />
                      <span className="font-medium text-gray-900">{user.displayName}</span>
                    </div>
                    <button onClick={() => signOut(auth)} className="text-sm text-red-600 font-medium">Sign Out</button>
                  </div>
                  {isAdmin && (
                    <Link 
                      to="/admin" 
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-xl font-bold"
                    >
                      <Settings className="w-5 h-5" />
                      Admin Dashboard
                    </Link>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                  className="w-full bg-blue-600 text-white px-4 py-3 rounded-xl font-medium"
                >
                  Sign In
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const ArticleCard = ({ article, lang }: { article: Article, lang: string }) => {
  const publishedAt = article.publishedAt?.toDate ? article.publishedAt.toDate() : new Date(article.publishedAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col h-full"
    >
      <div className="p-6 flex-1">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded">
            {article.category}
          </span>
          <span className="text-xs text-gray-400 font-medium">
            {formatDistanceToNow(publishedAt, { addSuffix: true })}
          </span>
        </div>
        <Link to={`/article/${article.slug}`} className="block group-hover:text-blue-600 transition-colors">
          <h3 className="text-xl font-bold text-gray-900 leading-tight mb-3 line-clamp-2">
            {article.headline}
          </h3>
        </Link>
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
          {article.summary}
        </p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          {article.sourceName}
        </span>
        <Link to={`/article/${article.slug}`} className="text-blue-600 flex items-center gap-1 text-sm font-bold group/btn">
          Read More
          <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
        </Link>
      </div>
    </motion.div>
  );
};

const HomePage = ({ articles, lang }: { articles: Article[], lang: string }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    let filtered = articles.filter(a => a.language === lang);
    if (selectedCategory) {
      filtered = filtered.filter(a => a.category.toLowerCase() === selectedCategory.toLowerCase());
    }
    return filtered;
  }, [articles, lang, selectedCategory]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <div className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tight mb-4">
          Latest <span className="text-blue-600">Global</span> Stories
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          AI-curated, rewritten, and translated news from across the globe. Stay informed with neutral, summarized, and multi-lingual content.
        </p>
      </div>

      {/* Categories */}
      <div className="flex overflow-x-auto gap-3 pb-6 mb-8 scrollbar-hide">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            "flex-shrink-0 px-6 py-3 rounded-2xl text-sm font-bold transition-all border",
            !selectedCategory ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
          )}
        >
          All News
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "flex-shrink-0 px-6 py-3 rounded-2xl text-sm font-bold transition-all border flex items-center gap-2",
              selectedCategory === cat.id ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
            )}
          >
            <cat.icon className="w-4 h-4" />
            {lang === 'en' ? cat.en : cat.name}
          </button>
        ))}
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((article) => (
            <ArticleCard key={article.id} article={article} lang={lang} />
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <div className="bg-gray-50 rounded-3xl p-12 inline-block">
              <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No articles found</h3>
              <p className="text-gray-500">Try switching categories or languages.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ArticleDetail = ({ articles }: { articles: Article[] }) => {
  const { slug } = useParams();
  const article = articles.find(a => a.slug === slug);

  if (!article) return <div className="p-20 text-center">Article not found</div>;

  const publishedAt = article.publishedAt?.toDate ? article.publishedAt.toDate() : new Date(article.publishedAt);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 mb-8 hover:gap-3 transition-all">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Home
        </Link>
        
        <div className="flex items-center gap-3 mb-6">
          <span className="px-3 py-1 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-full">
            {article.category}
          </span>
          <span className="text-sm text-gray-500 font-medium">
            {formatDistanceToNow(publishedAt, { addSuffix: true })}
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-gray-900 leading-tight mb-8">
          {article.headline}
        </h1>

        {article.videoUrl && (
          <div className="mb-12 rounded-3xl overflow-hidden shadow-2xl bg-black aspect-video">
            <video 
              src={article.videoUrl} 
              controls 
              className="w-full h-full"
              poster={`https://picsum.photos/seed/${article.id}/1280/720`}
            />
          </div>
        )}

        <div className="bg-blue-50 rounded-3xl p-8 mb-12 border border-blue-100">
          <h2 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Key Highlights
          </h2>
          <ul className="space-y-3">
            {article.highlights.map((h, i) => (
              <li key={i} className="flex gap-3 text-blue-800 leading-relaxed">
                <span className="text-blue-400 font-black">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>

        <div className="prose prose-lg prose-blue max-w-none text-gray-700 leading-relaxed mb-12">
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </div>

        <div className="pt-12 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">Source</span>
            <span className="text-lg font-bold text-gray-900">{article.sourceName}</span>
          </div>
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-colors"
          >
            Visit Original Source
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </motion.div>
    </div>
  );
};

const AdminPage = ({ user, articles }: { user: User | null, articles: Article[] }) => {
  const [rawNews, setRawNews] = useState<RawNews[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "raw_news"), where("processed", "==", false), limit(20));
    const unsubRaw = onSnapshot(q, (snapshot) => {
      setRawNews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RawNews)));
    });

    // Check for API key for Veo
    const checkApiKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkApiKey();

    return () => unsubRaw();
  }, []);

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 50));

  const selectApiKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const generateVideo = async (article: Article) => {
    if (!hasApiKey) {
      addLog("Error: Please select an API key first for video generation.");
      return;
    }

    setIsVideoGenerating(article.id);
    addLog(`Starting video generation for: ${article.headline}`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

      // 1. Generate Script
      addLog("Generating news script...");
      const scriptPrompt = `
        Convert this news article into a natural, engaging news anchor script for a 30-40 second video.
        Article: ${article.headline}. ${article.summary}.
        Language: ${article.language === 'ne' ? 'Nepali' : article.language === 'hi' ? 'Hindi' : 'English'}
        Format: Just the spoken text, no stage directions.
      `;
      const scriptRes = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: scriptPrompt }] }]
      });
      const script = scriptRes.text;
      addLog("Script generated.");

      // 2. Generate Audio (TTS)
      addLog("Generating voice narration...");
      const ttsRes = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });
      const audioBase64 = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) throw new Error("Failed to generate audio");
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
      addLog("Audio generated.");

      // 3. Generate Anchor Video (Veo)
      addLog("Generating AI news anchor video (this may take a few minutes)...");
      const veoAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" }); 
      let operation = await veoAi.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: `A professional news anchor in a modern high-tech news studio, speaking directly to the camera, neutral expression, professional attire. High quality, 4k.`,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        addLog("Still generating video... please wait.");
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await veoAi.operations.getVideosOperation({ operation: operation });
      }

      const videoDownloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoDownloadLink) throw new Error("Failed to generate video");
      
      // Fetch video with API key
      const videoRes = await fetch(videoDownloadLink, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || "" }
      });
      const videoBlob = await videoRes.blob();
      const videoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(videoBlob);
      });
      addLog("Anchor video generated.");

      // 4. Merge Audio and Video (Server-side)
      addLog("Merging audio and video...");
      const mergeRes = await fetch("/api/merge-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl,
          videoUrl: videoDataUrl,
          articleId: article.id,
          lang: article.language
        })
      });
      const mergeData = await mergeRes.json();
      if (mergeData.status === "success") {
        addLog(`Success! Video ready: ${mergeData.videoUrl}`);
      } else {
        throw new Error(mergeData.error || "Merge failed");
      }

    } catch (e: any) {
      addLog(`Error: ${e.message}`);
      console.error(e);
    } finally {
      setIsVideoGenerating(null);
    }
  };

  const collectNews = async () => {
    setIsCollecting(true);
    addLog("Starting news collection (client-side)...");
    try {
      const res = await fetch("/api/fetch-rss");
      const data = await res.json();
      
      if (data.status !== "success") throw new Error(data.message || "Failed to fetch RSS");

      let addedCount = 0;
      let skippedCount = 0;

      for (const item of data.items) {
        try {
          // Check if already exists
          const q = query(collection(db, "raw_news"), where("link", "==", item.link));
          let snapshot;
          try {
            snapshot = await getDocs(q);
          } catch (err) {
            handleFirestoreError(err, OperationType.LIST, "raw_news");
            return;
          }
          
          if (snapshot.empty) {
            try {
              await addDoc(collection(db, "raw_news"), {
                ...item,
                processed: false,
                createdAt: serverTimestamp(),
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, "raw_news");
            }
            addedCount++;
          } else {
            skippedCount++;
          }
        } catch (err: any) {
          console.error("Firestore write error:", err);
          addLog(`Error adding ${item.title}: ${err.message}`);
        }
      }

      addLog(`Collection complete. ${addedCount} new items added, ${skippedCount} items skipped.`);
    } catch (e: any) {
      addLog(`Error: ${e.message}`);
    } finally {
      setIsCollecting(false);
    }
  };

  const processNews = async () => {
    if (rawNews.length === 0) return;
    setIsProcessing(true);
    addLog("Starting AI processing...");

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

    for (const item of rawNews) {
      addLog(`Processing: ${item.title}`);
      try {
        const prompt = `
          You are an expert news editor. Rewrite the following news item into a high-quality, neutral, and summarized article.
          
          News Title: ${item.title}
          Snippet: ${item.contentSnippet}
          Source: ${item.source}
          
          Output JSON format:
          {
            "en": {
              "headline": "...",
              "summary": "...",
              "content": "...",
              "highlights": ["...", "...", "..."],
              "category": "..."
            },
            "ne": {
              "headline": "...",
              "summary": "...",
              "content": "...",
              "highlights": ["...", "...", "..."],
              "category": "..."
            },
            "hi": {
              "headline": "...",
              "summary": "...",
              "content": "...",
              "highlights": ["...", "...", "..."],
              "category": "..."
            }
          }
          
          Requirements:
          1. Anti-plagiarism: Do not copy sentences. Rewrite completely.
          2. Categories: Choose from [politics, business, technology, health, science, sports, entertainment, education, environment, crime, lifestyle].
          3. Tone: Neutral and professional.
          4. Content: Full article should be 3-4 paragraphs.
          5. Language: Ensure perfect grammar for Nepali and Hindi.
        `;

        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });

        const data = JSON.parse(result.text);
        
        // Save articles for each language
        for (const lang of ["en", "ne", "hi"]) {
          const langData = data[lang];
          const slug = `${langData.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
          
          try {
            await addDoc(collection(db, "articles"), {
              ...langData,
              language: lang,
              sourceName: item.source,
              sourceUrl: item.link,
              publishedAt: serverTimestamp(),
              slug,
              originalId: item.id
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, "articles");
          }
        }

        // Mark as processed
        try {
          await updateDoc(doc(db, "raw_news", item.id), { processed: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `raw_news/${item.id}`);
        }
        addLog(`Success: ${item.title}`);
      } catch (e) {
        addLog(`Failed: ${item.title} - ${e.message}`);
      }
    }
    setIsProcessing(false);
    addLog("AI processing complete.");
  };

  if (!user) return <div className="p-20 text-center">Please sign in to access admin.</div>;
  if (user.email !== ADMIN_EMAIL) return <div className="p-20 text-center text-red-600 font-bold">Access Denied: You do not have admin privileges.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <h2 className="text-3xl font-black text-gray-900">Admin Dashboard</h2>
            <div className="flex flex-wrap gap-4">
              {!hasApiKey && (
                <button
                  onClick={selectApiKey}
                  className="flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-amber-600 transition-all"
                >
                  <Key className="w-5 h-5" />
                  Select Video API Key
                </button>
              )}
              <button
                onClick={collectNews}
                disabled={isCollecting}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold disabled:opacity-50"
              >
                {isCollecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                Collect News
              </button>
              <button
                onClick={processNews}
                disabled={isProcessing || rawNews.length === 0}
                className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                Process AI ({rawNews.length})
              </button>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="p-6 bg-gray-50 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Recent Articles & Video Generation</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {articles.slice(0, 10).map(article => (
                  <div key={article.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {article.language}
                        </span>
                        <h4 className="font-bold text-gray-900 line-clamp-1">{article.headline}</h4>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-1">{article.summary}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {article.videoUrl ? (
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-xs font-bold">
                          <Video className="w-4 h-4" />
                          Video Ready
                        </div>
                      ) : (
                        <button
                          onClick={() => generateVideo(article)}
                          disabled={!!isVideoGenerating}
                          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 disabled:opacity-50 transition-all"
                        >
                          {isVideoGenerating === article.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Video className="w-4 h-4" />
                          )}
                          Generate Video
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="p-6 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Pending Raw News</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {rawNews.map(item => (
                <div key={item.id} className="p-6 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-gray-500">{item.source} • {item.pubDate}</p>
                  </div>
                  <a href={item.link} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-blue-600">
                    <ExternalLink className="w-5 h-5" />
                  </a>
                </div>
              ))}
              {rawNews.length === 0 && (
                <div className="p-12 text-center text-gray-400">No pending news items.</div>
              )}
            </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            System Logs
          </h3>
          <div className="bg-gray-900 rounded-3xl p-6 h-[800px] overflow-y-auto font-mono text-[10px] space-y-2">
            {logs.map((log, i) => (
              <div key={i} className={cn(
                "pb-1 border-b border-gray-800",
                log.startsWith("Error") || log.startsWith("Failed") ? "text-red-400" : 
                log.startsWith("Success") ? "text-green-400" : "text-gray-400"
              )}>
                <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                {log}
              </div>
            ))}
            {logs.length === 0 && <div className="text-gray-700 italic">Waiting for actions...</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState("en");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    const q = query(collection(db, "articles"), orderBy("publishedAt", "desc"), limit(50));
    const unsubArticles = onSnapshot(q, (snapshot) => {
      setArticles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "articles");
    });

    return () => {
      unsubAuth();
      unsubArticles();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Global News...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100 selection:text-blue-900">
        <Navbar user={user} lang={lang} setLang={setLang} />
        
        <main>
          <Routes>
            <Route path="/" element={<HomePage articles={articles} lang={lang} />} />
            <Route path="/article/:slug" element={<ArticleDetail articles={articles} />} />
            <Route path="/admin" element={<AdminPage user={user} articles={articles} />} />
          </Routes>
        </main>

        <footer className="bg-white border-t border-gray-200 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex justify-center items-center gap-2 mb-6">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Newspaper className="text-white w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-gray-900">Global News AI</span>
            </div>
            <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
              An automated news portal powered by AI. We collect, rewrite, and translate news to provide a neutral perspective across multiple languages.
            </p>
            <div className="mt-8 pt-8 border-t border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-widest">
              © 2026 Global News AI • Built with Gemini & Firebase
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}
