import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
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
  getDoc,
  getDocFromServer
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
  Key,
  Search,
  ArrowRight,
  Clock,
  Share2,
  Bookmark,
  Mail,
  ChevronDown
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
  mediaUrl?: string;
  isImage?: boolean;
}

interface RawNews {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
  processed: boolean;
  imageUrl?: string;
}

// --- Constants ---
const CATEGORIES = [
  { id: "world", name: "विश्व", en: "World", icon: Globe },
  { id: "politics", name: "राजनीति", en: "Politics", icon: ShieldAlert },
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

// --- Theme Context ---
const ThemeContext = React.createContext<{ theme: 'light' | 'dark', toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} });

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved as 'light' | 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = () => React.useContext(ThemeContext);

// --- Components ---

const ADMIN_EMAIL = "sujan1nepal.wsn@gmail.com";

const Navbar = ({ 
  user, 
  lang, 
  setLang, 
  searchQuery, 
  setSearchQuery 
}: { 
  user: User | null, 
  lang: string, 
  setLang: (l: string) => void,
  searchQuery: string,
  setSearchQuery: (q: string) => void
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isAdmin = user?.email === ADMIN_EMAIL;

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Dynamic Breaking News Ticker */}
      <div className="bg-brand-accent text-white py-2 px-4 overflow-hidden whitespace-nowrap">
        <div className="inline-block animate-marquee hover:pause">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mx-8">
            Breaking: AI-Powered Global News Network • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mx-8">
            Live Updates: Real-time translation active for 12+ languages
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] mx-8">
            Trending: Global Markets react to new AI regulations
          </span>
        </div>
      </div>
      
      {/* Main Nav */}
      <nav className="bg-[var(--bg)]/80 backdrop-blur-2xl border-b border-[var(--line)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="bg-[var(--ink)] p-2.5 rounded-2xl group-hover:bg-brand-accent transition-all duration-500 rotate-3 group-hover:rotate-0">
                <Newspaper className="text-[var(--bg)] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-serif font-black tracking-tighter text-[var(--ink)] leading-none">GLOBAL</span>
                <span className="text-[10px] font-bold tracking-[0.3em] text-[var(--muted)] leading-none mt-1">NEWS AI</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              {CATEGORIES.slice(0, 6).map((cat) => (
                <Link 
                  key={cat.id} 
                  to={`/category/${cat.id}`}
                  className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] hover:text-brand-accent transition-colors relative group"
                >
                  {lang === 'en' ? cat.en : cat.name}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-brand-accent transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
              <div className="h-4 w-px bg-[var(--line)] mx-2" />
              <button 
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            {/* User & Lang & Theme */}
            <div className="hidden md:flex items-center gap-6">
              <button 
                onClick={toggleTheme}
                className="p-2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors bg-[var(--line)] rounded-full"
              >
                {theme === 'light' ? <Clock className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-1 bg-[var(--line)] p-1 rounded-full">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                      lang === l.code ? "bg-[var(--bg)] text-brand-accent shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"
                    )}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 group cursor-pointer">
                    <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-[var(--line)]" />
                    <ChevronDown className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--ink)]" />
                  </div>
                  {isAdmin && (
                    <Link to="/admin" className="bg-[var(--ink)] text-[var(--bg)] p-2 rounded-xl hover:bg-brand-accent transition-colors">
                      <Settings className="w-4 h-4" />
                    </Link>
                  )}
                  <button onClick={() => signOut(auth)} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600">Exit</button>
                </div>
              ) : (
                <button
                  onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                  className="bg-[var(--ink)] text-[var(--bg)] px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-brand-accent transition-all"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center gap-4">
              <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 text-[var(--muted)]">
                <Search className="w-5 h-5" />
              </button>
              <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-[var(--ink)]">
                {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar Overlay */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-full left-0 w-full bg-[var(--bg)] border-b border-[var(--line)] p-4 shadow-2xl"
            >
              <div className="max-w-3xl mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
                <input 
                  type="text"
                  placeholder="Search for news, topics, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-[var(--line)] border-none rounded-2xl focus:ring-2 focus:ring-brand-accent text-lg font-serif text-[var(--ink)]"
                  autoFocus
                />
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            className="fixed inset-0 z-[60] bg-[var(--bg)] lg:hidden"
          >
            <div className="p-6 h-full overflow-y-auto pb-32">
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-3">
                  <div className="bg-[var(--ink)] p-2 rounded-2xl">
                    <Newspaper className="text-[var(--bg)] w-6 h-6" />
                  </div>
                  <span className="text-xl font-serif font-black tracking-tighter text-[var(--ink)]">GLOBAL NEWS</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 text-[var(--ink)]">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  {CATEGORIES.map((cat) => (
                    <Link 
                      key={cat.id} 
                      to={`/category/${cat.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 p-4 bg-[var(--line)] rounded-2xl"
                    >
                      <cat.icon className="w-5 h-5 text-brand-accent" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ink)]">{lang === 'en' ? cat.en : cat.name}</span>
                    </Link>
                  ))}
                </div>

                <div className="pt-8 border-t border-[var(--line)]">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-4">Edition</h4>
                  <div className="flex gap-2">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setIsOpen(false); }}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border",
                          lang === l.code ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)]"
                        )}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>

                {user ? (
                  <div className="pt-8 border-t border-[var(--line)]">
                    <div className="flex items-center gap-4 mb-6">
                      <img src={user.photoURL || ""} alt="" className="w-12 h-12 rounded-full" />
                      <div>
                        <p className="font-bold text-[var(--ink)]">{user.displayName}</p>
                        <p className="text-xs text-[var(--muted)]">{user.email}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {isAdmin && (
                        <Link 
                          to="/admin" 
                          onClick={() => setIsOpen(false)}
                          className="flex items-center justify-center gap-2 w-full py-4 bg-[var(--ink)] text-[var(--bg)] rounded-2xl font-bold uppercase tracking-widest"
                        >
                          <Settings className="w-5 h-5" />
                          Admin Dashboard
                        </Link>
                      )}
                      <button onClick={() => signOut(auth)} className="w-full py-4 border border-red-200 text-red-500 rounded-2xl font-bold uppercase tracking-widest">Sign Out</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                    className="w-full py-4 bg-[var(--ink)] text-[var(--bg)] rounded-2xl font-bold uppercase tracking-widest"
                  >
                    Sign In to Global News
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

const BottomNav = ({ lang, user }: { lang: string, user: User | null }) => {
  const isAdmin = user?.email === ADMIN_EMAIL;
  
  return (
    <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
      <div className="bg-[var(--bg)]/80 backdrop-blur-2xl border border-[var(--line)] rounded-full px-6 py-4 flex justify-between items-center shadow-2xl">
        <Link to="/" className="p-2 text-brand-accent">
          <Newspaper className="w-6 h-6" />
        </Link>
        <Link to="/category/world" className="p-2 text-[var(--muted)]">
          <Globe className="w-6 h-6" />
        </Link>
        <Link to="/category/technology" className="p-2 text-[var(--muted)]">
          <Cpu className="w-6 h-6" />
        </Link>
        {user ? (
          isAdmin ? (
            <Link to="/admin" className="p-2 text-brand-accent bg-brand-accent/10 rounded-full">
              <Settings className="w-6 h-6" />
            </Link>
          ) : (
            <Link to="/bookmarks" className="p-2 text-brand-accent">
              <Bookmark className="w-6 h-6 fill-current" />
            </Link>
          )
        ) : (
          <button 
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            className="p-2 text-[var(--muted)]"
          >
            <Mail className="w-6 h-6" />
          </button>
        )}
        <Link to="/bookmarks" className="p-2 text-[var(--muted)]">
          <Bookmark className="w-6 h-6" />
        </Link>
      </div>
    </div>
  );
};

const ArticleCard = ({ article, lang, featured = false }: { article: Article, lang: string, featured?: boolean }) => {
  const publishedAt = article.publishedAt?.toDate ? article.publishedAt.toDate() : new Date(article.publishedAt);
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('bookmarks');
    if (saved) {
      const ids = JSON.parse(saved);
      setIsBookmarked(ids.includes(article.id));
    }
  }, [article.id]);

  const toggleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const saved = localStorage.getItem('bookmarks');
    let ids = saved ? JSON.parse(saved) : [];
    if (isBookmarked) {
      ids = ids.filter((id: string) => id !== article.id);
    } else {
      ids.push(article.id);
    }
    localStorage.setItem('bookmarks', JSON.stringify(ids));
    setIsBookmarked(!isBookmarked);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5 }}
      className={cn(
        "bento-item group flex flex-col h-full",
        featured ? "col-span-full lg:col-span-8 lg:row-span-4" : "col-span-full md:col-span-6 lg:col-span-4 lg:row-span-2"
      )}
    >
      {/* Media Section */}
      {(article.mediaUrl || article.videoUrl) && (
        <div className={cn("relative overflow-hidden", featured ? "h-64 lg:h-full" : "h-48")}>
          <img 
            src={article.mediaUrl || `https://picsum.photos/seed/${article.id}/800/600`} 
            alt={article.headline}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink)]/80 via-transparent to-transparent opacity-60" />
          
          <div className="absolute top-4 right-4 flex gap-2">
            <button 
              onClick={toggleBookmark}
              className={cn(
                "p-2 rounded-full backdrop-blur-md transition-all shadow-lg",
                isBookmarked ? "bg-brand-accent text-white" : "bg-white/20 text-white hover:bg-white/40"
              )}
            >
              <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
            </button>
            {article.videoUrl && (
              <div className="bg-brand-accent/90 backdrop-blur-md p-2 rounded-full text-white shadow-lg">
                <Play className="w-4 h-4 fill-current" />
              </div>
            )}
          </div>
          
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="px-2 py-1 bg-brand-accent text-white text-[10px] font-black uppercase tracking-widest rounded-md">
              {article.category}
            </span>
          </div>
        </div>
      )}

      <div className="p-6 flex-1 flex flex-col">
        {!featured && !article.mediaUrl && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-brand-accent/10 text-brand-accent text-[10px] font-black uppercase tracking-widest rounded-md">
                {article.category}
              </span>
              <span className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest">
                {formatDistanceToNow(publishedAt, { addSuffix: true })}
              </span>
            </div>
            <button 
              onClick={toggleBookmark}
              className={cn(
                "p-1.5 rounded-full transition-all",
                isBookmarked ? "text-brand-accent bg-brand-accent/10" : "text-[var(--muted)] hover:text-brand-accent hover:bg-brand-accent/5"
              )}
            >
              <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
            </button>
          </div>
        )}

        <Link to={`/article/${article.slug}`} className="block group-hover:text-brand-accent transition-colors">
          <h3 className={cn(
            "font-serif font-bold tracking-tight text-[var(--ink)] leading-tight mb-3",
            featured ? "text-2xl lg:text-4xl" : "text-xl line-clamp-2"
          )}>
            {article.headline}
          </h3>
        </Link>
        
        <p className={cn(
          "text-[var(--muted)] text-sm leading-relaxed mb-6",
          featured ? "line-clamp-3 lg:line-clamp-4" : "line-clamp-3"
        )}>
          {article.summary}
        </p>

        <div className="mt-auto pt-4 border-t border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-accent/20 rounded-full flex items-center justify-center">
              <Globe className="w-3 h-3 text-brand-accent" />
            </div>
            <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">
              {article.sourceName}
            </span>
          </div>
          <Link to={`/article/${article.slug}`} className="text-brand-accent flex items-center gap-1 text-xs font-black uppercase tracking-widest group/btn">
            Read
            <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

const HomePage = ({ articles, lang, searchQuery }: { articles: Article[], lang: string, searchQuery: string }) => {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const urlCategory = categoryId || searchParams.get('category');
  const navigate = useNavigate();

  const filteredArticles = useMemo(() => {
    let filtered = articles.filter(a => a.language === lang);
    
    if (urlCategory) {
      filtered = filtered.filter(a => a.category.toLowerCase() === urlCategory.toLowerCase());
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => 
        a.headline.toLowerCase().includes(query) || 
        a.summary.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [articles, lang, urlCategory, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Immersive Header */}
      <div className="mb-16 text-center lg:text-left">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block px-4 py-1.5 bg-brand-accent/10 rounded-full text-brand-accent text-[10px] font-black uppercase tracking-[0.3em] mb-6"
        >
          Curated by Global Intelligence
        </motion.div>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-black text-[var(--ink)] tracking-tighter leading-[0.9] mb-8">
          {urlCategory ? (
            <>
              {CATEGORIES.find(c => c.id === urlCategory)?.en || urlCategory} <br />
              <span className="text-brand-accent italic">Intelligence.</span>
            </>
          ) : (
            <>
              The World <br />
              <span className="text-brand-accent italic">In Focus.</span>
            </>
          )}
        </h1>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <p className="text-lg text-[var(--muted)] max-w-xl leading-relaxed">
            {urlCategory 
              ? `In-depth reporting and AI-driven insights on ${urlCategory} affairs, updated in real-time across the global network.`
              : "Experience news through the lens of AI. Real-time translation, neutral summarization, and immersive storytelling for the modern reader."
            }
          </p>
          
          {/* Quick Stats / Bento Mini */}
          <div className="flex gap-4">
            <div className="bg-[var(--line)] p-4 rounded-2xl flex flex-col items-center justify-center min-w-[100px]">
              <span className="text-2xl font-serif font-bold text-[var(--ink)]">{filteredArticles.length}</span>
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">Stories</span>
            </div>
            <div className="bg-[var(--line)] p-4 rounded-2xl flex flex-col items-center justify-center min-w-[100px]">
              <span className="text-2xl font-serif font-bold text-[var(--ink)]">12+</span>
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">Regions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Categories - Pill Navigation */}
      <div className="flex overflow-x-auto gap-3 pb-8 mb-12 no-scrollbar">
        <button
          onClick={() => navigate('/')}
          className={cn(
            "flex-shrink-0 px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border",
            !urlCategory 
              ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] shadow-xl" 
              : "bg-transparent border-[var(--line)] text-[var(--muted)] hover:border-brand-accent hover:text-brand-accent"
          )}
        >
          All Editions
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => navigate(`/category/${cat.id}`)}
            className={cn(
              "flex-shrink-0 px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-2",
              urlCategory === cat.id 
                ? "bg-[var(--ink)] border-[var(--ink)] text-[var(--bg)] shadow-xl" 
                : "bg-transparent border-[var(--line)] text-[var(--muted)] hover:border-brand-accent hover:text-brand-accent"
            )}
          >
            <cat.icon className="w-3 h-3" />
            {lang === 'en' ? cat.en : cat.name}
          </button>
        ))}
      </div>

      {/* Bento Grid Layout */}
      <div className="bento-grid">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((article, index) => (
            <ArticleCard 
              key={article.id} 
              article={article} 
              lang={lang} 
              featured={index === 0 && !urlCategory && !searchQuery} 
            />
          ))
        ) : (
          <div className="col-span-full py-32 text-center">
            <div className="bg-[var(--line)] rounded-[3rem] p-16 inline-block">
              <Newspaper className="w-16 h-16 text-[var(--muted)] mx-auto mb-6 opacity-20" />
              <h3 className="text-2xl font-serif font-bold text-[var(--ink)] mb-3">No stories found</h3>
              <p className="text-[var(--muted)]">Try adjusting your filters or switching languages.</p>
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

  if (!article) return <div className="p-20 text-center font-serif text-2xl text-[var(--ink)]">Article not found</div>;

  const publishedAt = article.publishedAt?.toDate ? article.publishedAt.toDate() : new Date(article.publishedAt);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent mb-12 hover:gap-3 transition-all">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Intelligence
        </Link>
        
        <div className="flex items-center gap-3 mb-8">
          <span className="px-3 py-1 bg-brand-accent text-white text-[10px] font-black uppercase tracking-widest rounded-full">
            {article.category}
          </span>
          <span className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest">
            {formatDistanceToNow(publishedAt, { addSuffix: true })}
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-black text-[var(--ink)] leading-[1.1] tracking-tighter mb-12">
          {article.headline}
        </h1>

        {article.isImage && article.mediaUrl && (
          <div className="mb-16 rounded-[3rem] overflow-hidden shadow-2xl border border-[var(--line)]">
            <img 
              src={article.mediaUrl} 
              alt={article.headline}
              className="w-full h-auto object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {article.videoUrl && (
          <div className="mb-16 rounded-[3rem] overflow-hidden shadow-2xl bg-black aspect-video">
            <video 
              src={article.videoUrl} 
              controls 
              className="w-full h-full"
              poster={`https://picsum.photos/seed/${article.id}/1280/720`}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Highlights Sidebar */}
          <div className="lg:col-span-4">
            <div className="bg-brand-accent/5 rounded-[2rem] p-8 border border-brand-accent/10 sticky top-32">
              <h2 className="text-xs font-black text-brand-accent uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Intelligence Brief
              </h2>
              <ul className="space-y-6">
                {article.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-[var(--ink)] leading-relaxed font-medium flex gap-3">
                    <span className="text-brand-accent font-black">0{i+1}</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-8">
            <div className="prose prose-lg dark:prose-invert prose-brand max-w-none text-[var(--ink)] leading-relaxed font-serif text-xl mb-16">
              <ReactMarkdown>{article.content}</ReactMarkdown>
            </div>

            <div className="pt-12 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-accent/10 rounded-full flex items-center justify-center">
                  <Globe className="w-6 h-6 text-brand-accent" />
                </div>
                <div>
                  <span className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest block mb-1">Source Intelligence</span>
                  <span className="text-xl font-serif font-bold text-[var(--ink)]">{article.sourceName}</span>
                </div>
              </div>
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-[var(--ink)] text-[var(--bg)] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-brand-accent transition-all shadow-xl"
              >
                Original Report
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AdminPage = ({ user, articles, rawNews }: { user: User | null, articles: Article[], rawNews: any[] }) => {
  const [isCollecting, setIsCollecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkKey();
  }, []);

  // Auto-process news if any pending
  useEffect(() => {
    if (rawNews.length > 0 && !isProcessing && !isCollecting) {
      const timer = setTimeout(() => {
        processNews();
      }, 5000); // Wait 5 seconds before auto-starting
      return () => clearTimeout(timer);
    }
  }, [rawNews.length, isProcessing, isCollecting]);

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 50));

  const selectApiKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const generateFreeVideo = async (article: Article) => {
    setIsVideoGenerating(article.id);
    addLog(`Starting FREE video generation for: ${article.headline}`);

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

      // 3. Generate Static Anchor Image (Free)
      addLog("Generating AI news anchor image (Free)...");
      const imageRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: 'A professional news anchor in a modern high-tech news studio, looking directly at the camera, neutral expression, professional attire. High quality, photorealistic.',
            },
          ],
        },
      });
      
      let anchorImageData = "";
      for (const part of imageRes.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          anchorImageData = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      if (!anchorImageData) throw new Error("Failed to generate anchor image");
      addLog("Anchor image generated.");

      // 4. Merge Audio and Image (Server-side)
      addLog("Merging audio and image into video...");
      const mergeRes = await fetch("/api/merge-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl,
          mediaUrl: anchorImageData,
          articleId: article.id,
          lang: article.language,
          isImage: true
        })
      });

      let mergeData;
      const contentType = mergeRes.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        mergeData = await mergeRes.json();
      } else {
        const text = await mergeRes.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server error: ${mergeRes.status} ${mergeRes.statusText}`);
      }

      if (mergeData.status === "success") {
        // Update Firestore on client-side
        try {
          await updateDoc(doc(db, "articles", article.id), {
            videoUrl: mergeData.videoUrl,
            videoGeneratedAt: serverTimestamp()
          });
          addLog(`Success! Free Video ready: ${mergeData.videoUrl}`);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `articles/${article.id}`);
        }
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
          mediaUrl: videoDataUrl, // Use mediaUrl instead of videoUrl
          articleId: article.id,
          lang: article.language,
          isImage: false // Explicitly set isImage to false
        })
      });
      
      let mergeData;
      const contentType = mergeRes.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        mergeData = await mergeRes.json();
      } else {
        const text = await mergeRes.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server error: ${mergeRes.status} ${mergeRes.statusText}`);
      }

      if (mergeData.status === "success") {
        // Update Firestore on client-side
        try {
          await updateDoc(doc(db, "articles", article.id), {
            videoUrl: mergeData.videoUrl,
            videoGeneratedAt: serverTimestamp()
          });
          addLog(`Success! Video ready: ${mergeData.videoUrl}`);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `articles/${article.id}`);
        }
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
    addLog("Fetching latest news from server...");
    try {
      const res = await fetch("/api/fetch-rss");
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      
      if (data.status !== "success") throw new Error(data.message || "Failed to fetch RSS");

      addLog(`Server has ${data.items.length} pending items ready for processing.`);
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
              mediaUrl: item.imageUrl || "", // Use extracted image from source
              isImage: !!item.imageUrl,
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
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
        <div className="lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900">Admin Dashboard</h2>
            <div className="flex flex-wrap gap-3 md:gap-4">
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
                    <div className="flex flex-wrap items-center gap-3">
                      {article.videoUrl ? (
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-xs font-bold">
                          <Video className="w-4 h-4" />
                          Video Ready
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => generateFreeVideo(article)}
                            disabled={!!isVideoGenerating}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
                          >
                            {isVideoGenerating === article.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Video className="w-4 h-4" />
                            )}
                            Generate Free Video
                          </button>
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
                            Generate Video (Veo)
                          </button>
                        </>
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
    <Router>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </Router>
  );
}

const LiveFeedPage = ({ articles, lang }: { articles: Article[], lang: string }) => {
  const liveArticles = useMemo(() => {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return articles
      .filter(a => {
        const date = a.publishedAt?.toDate ? a.publishedAt.toDate() : new Date(a.publishedAt);
        return date > oneDayAgo;
      })
      .sort((a, b) => {
        const dateA = a.publishedAt?.toDate ? a.publishedAt.toDate() : new Date(a.publishedAt);
        const dateB = b.publishedAt?.toDate ? b.publishedAt.toDate() : new Date(b.publishedAt);
        return dateB.getTime() - dateA.getTime();
      });
  }, [articles]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-serif font-black text-[var(--ink)] mb-4">Live Update Feed</h1>
        <p className="text-[var(--muted)] max-w-2xl">Real-time intelligence stream from across the global network. Updated as events unfold.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {liveArticles.map(article => (
          <ArticleCard key={article.id} article={article} lang={lang} />
        ))}
      </div>
    </div>
  );
};

const BookmarksPage = ({ articles, lang, user }: { articles: Article[], lang: string, user: User | null }) => {
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('bookmarks');
    if (saved) setBookmarkedIds(JSON.parse(saved));
  }, []);

  const bookmarkedArticles = useMemo(() => {
    return articles.filter(a => bookmarkedIds.includes(a.id));
  }, [articles, bookmarkedIds]);

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-32 text-center">
        <h2 className="text-3xl font-serif font-bold mb-4">Sign in to view bookmarks</h2>
        <p className="text-[var(--muted)] mb-8">Your reading list is synced across all your devices.</p>
        <button
          onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
          className="bg-[var(--ink)] text-[var(--bg)] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-serif font-black text-[var(--ink)] mb-4">Your Intelligence Brief</h1>
        <p className="text-[var(--muted)] max-w-2xl">Saved reports and deep-dives for your personal review.</p>
      </div>
      {bookmarkedArticles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {bookmarkedArticles.map(article => (
            <ArticleCard key={article.id} article={article} lang={lang} />
          ))}
        </div>
      ) : (
        <div className="py-32 text-center bg-[var(--line)] rounded-[3rem]">
          <Bookmark className="w-16 h-16 text-[var(--muted)] mx-auto mb-6 opacity-20" />
          <h3 className="text-2xl font-serif font-bold text-[var(--ink)] mb-3">No bookmarks yet</h3>
          <p className="text-[var(--muted)]">Save articles to read them later, even offline.</p>
        </div>
      )}
    </div>
  );
};

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState("en");
  const [articles, setArticles] = useState<Article[]>([]);
  const [rawNews, setRawNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    // Test connection to Firestore
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection test successful.");
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    };
    testConnection();

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

  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) {
      setRawNews([]);
      return;
    }

    const qRaw = query(collection(db, "raw_news"), where("processed", "==", false), orderBy("createdAt", "desc"), limit(50));
    const unsubRaw = onSnapshot(qRaw, (snapshot) => {
      setRawNews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "raw_news");
    });

    return () => unsubRaw();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-limestone">
        <Loader2 className="w-12 h-12 text-brand-accent animate-spin" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col pb-24 md:pb-0">
          <Navbar 
            user={user} 
            lang={lang} 
            setLang={setLang} 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery} 
          />
          
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage articles={articles} lang={lang} searchQuery={searchQuery} />} />
              <Route path="/category/:categoryId" element={<HomePage articles={articles} lang={lang} searchQuery={searchQuery} />} />
              <Route path="/live" element={<LiveFeedPage articles={articles} lang={lang} />} />
              <Route path="/bookmarks" element={<BookmarksPage articles={articles} lang={lang} user={user} />} />
              <Route path="/article/:slug" element={<ArticleDetail articles={articles} />} />
              <Route path="/admin" element={<AdminPage user={user} articles={articles} rawNews={rawNews} />} />
            </Routes>
          </main>

          <footer className="bg-[var(--ink)] text-[var(--bg)] py-16 px-4">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-brand-accent p-2 rounded-2xl">
                    <Newspaper className="text-white w-6 h-6" />
                  </div>
                  <span className="text-2xl font-serif font-black tracking-tighter">GLOBAL NEWS AI</span>
                </div>
                <p className="text-[var(--muted)] max-w-md leading-relaxed mb-8">
                  The next generation of news. Powered by advanced artificial intelligence to bring you the most accurate, neutral, and immersive news experience on the planet.
                </p>
                <div className="flex gap-4">
                  <button className="p-3 bg-[var(--line)] rounded-full hover:text-brand-accent transition-colors">
                    <Globe className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-[var(--line)] rounded-full hover:text-brand-accent transition-colors">
                    <Mail className="w-5 h-5" />
                  </button>
                  <button className="p-3 bg-[var(--line)] rounded-full hover:text-brand-accent transition-colors">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-accent mb-6">Network</h4>
                <ul className="space-y-4 text-sm font-bold uppercase tracking-widest">
                  <li><Link to="/" className="hover:text-brand-accent transition-colors">Intelligence</Link></li>
                  <li><Link to="/category/world" className="hover:text-brand-accent transition-colors">Global Reports</Link></li>
                  <li><Link to="/live" className="hover:text-brand-accent transition-colors">Live Feed</Link></li>
                  <li><Link to="/category/science" className="hover:text-brand-accent transition-colors">Archive</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-accent mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-bold uppercase tracking-widest">
                  <li><Link to="/" className="hover:text-brand-accent transition-colors">Privacy Protocol</Link></li>
                  <li><Link to="/" className="hover:text-brand-accent transition-colors">Terms of Service</Link></li>
                  <li><Link to="/" className="hover:text-brand-accent transition-colors">AI Ethics</Link></li>
                  <li><Link to="/" className="hover:text-brand-accent transition-colors">Contact</Link></li>
                </ul>
              </div>
            </div>
            <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[var(--line)] flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                © 2026 Global News AI Network. All Rights Reserved.
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] flex items-center gap-2">
                Built with <HeartPulse className="w-3 h-3 text-red-500" /> for the Future.
              </p>
            </div>
          </footer>

          <BottomNav lang={lang} user={user} />
        </div>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
