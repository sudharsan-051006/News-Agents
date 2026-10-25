import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Film,
  FolderCog,
  Globe2,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Newspaper,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import CategoriesPanel from "./CategoriesPanel";
import "../styles/Dashboard.css";
import "../styles/DashboardNav.css";
import "../styles/Pagination.css";

// Number of story cards shown per page below the carousel.
const PAGE_SIZE = 10;

// Builds a compact page list like [1, "…", 4, 5, 6, "…", 12].
function getPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) { pages.add(2); pages.add(3); pages.add(4); }
  if (current >= total - 2) { pages.add(total - 1); pages.add(total - 2); pages.add(total - 3); }
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const list = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) list.push("…");
    list.push(p);
  });
  return list;
}

const TOPIC_ICONS = {
  "all topics": Layers,
  geopolitics: Globe2,
  local: MapPin,
  movies: Film,
  sports: Trophy,
  tech: Cpu,
  technology: Cpu,
};

// Table used by the "Your Stories" feed. Change here if your table is named differently.
const PRIVATE_NEWS_TABLE = "private_news_cache";

function formatTime(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function mapArticle(row, index) {
  let author = "News source";
  try {
    if (row.source) author = new URL(row.source).hostname.replace(/^www\./i, "");
  } catch {
    // Keep the fallback author when a source value is not a URL.
  }
  return {
    id: row.id ?? `${row.link || row.ai_headline || "article"}-${index}`,
    title: row.ai_headline || row.original_title || "Untitled story",
    category: row.category || "General",
    source: row.source || "News source",
    author,
    time: formatTime(row.published_at || row.created_at),
    image: row.image_url || "",
    summary: row.ai_summary || "",
    link: row.link || "",
  };
}

async function loadPersonalizedTrends(userId) {
  const { data: follows, error: followsError } = await supabase
    .from("category_follows")
    .select("category_id")
    .eq("user_id", userId);
  if (followsError) throw followsError;
  const categoryIds = [...new Set((follows || []).map((row) => row.category_id))];
  if (!categoryIds.length) return { categories: [], trends: [] };
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id,name")
    .in("id", categoryIds);
  if (categoriesError) throw categoriesError;
  const categoryNames = [...new Set((categories || []).map((category) => category.name).filter(Boolean))];
  if (!categoryNames.length) return { categories: categories || [], trends: [] };
  const { data: trendRows, error: trendsError } = await supabase
    .from("trend_events")
    .select("id,title,category,first_seen,last_seen,article_count,publisher_count,news_score,trend_status,updated_at")
    .in("category", categoryNames)
    .order("news_score", { ascending: false })
    .limit(60);
  if (trendsError) throw trendsError;
  const eventIds = (trendRows || []).map((trend) => trend.id);
  let sourceRows = [];
  if (eventIds.length) {
    const { data, error } = await supabase
      .from("trend_sources")
      .select(
        "event_id,article_url,article_title,publisher,category,published_at,observed_at,image_url"
      )
      .in("event_id", eventIds)
      .order("published_at", { ascending: false });

    if (error) throw error;

    sourceRows = data || [];
  }
  const sourceByEvent = new Map();

  for (const source of sourceRows) {
    const existing = sourceByEvent.get(source.event_id);

    if (!existing) {
      sourceByEvent.set(source.event_id, source);
      continue;
    }

    // Prefer an article with an image over one without an image.
    if (!existing.image_url && source.image_url) {
      sourceByEvent.set(source.event_id, source);
    }
  }
  const trends = (trendRows || []).map((trend) => {
    const source = sourceByEvent.get(trend.id);
    return {
      id: trend.id,
      title: trend.title || source?.article_title || "Untitled trend",
      category: trend.category || "General",
      source: source?.publisher || "Multiple news sources",
      author: source?.publisher || "Multiple news sources",
      time: formatTime(source?.published_at || trend.last_seen || trend.updated_at),
      image: source?.image_url || "",
      summary: `${trend.article_count} articles from ${trend.publisher_count} publishers.`,
      link: source?.article_url || "",
      articleCount: trend.article_count,
      publisherCount: trend.publisher_count,
      newsScore: Number(trend.news_score) || 0,
      trendStatus: trend.trend_status,
    };
  });
  return { categories: categories || [], trends };
}

async function loadPublicCategoryStories() {
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id,name,visibility")
    .eq("visibility", "public")
    .order("name", { ascending: true });
  if (categoriesError) throw categoriesError;

  const publicRows = categories || [];
  const categoryIds = publicRows.map((category) => category.id);
  if (!categoryIds.length) return { categories: [], stories: [] };

  const { data: associations, error: associationError } = await supabase
    .from("category_sources")
    .select("rss!category_sources_rss_id_fkey(id,rss_url,category),categories!category_sources_category_id_fkey(id,name,visibility)")
    .in("category_id", categoryIds);
  if (associationError) throw associationError;

  const sourceCategoryMap = new Map();
  for (const row of associations || []) {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const rss = Array.isArray(row.rss) ? row.rss[0] : row.rss;
    if (category?.visibility !== "public" || !rss?.rss_url) continue;
    sourceCategoryMap.set(rss.rss_url, category.name || rss.category || "General");
  }

  const urls = [...sourceCategoryMap.keys()];
  if (!urls.length) return { categories: publicRows, stories: [] };

  // Public stories ("Stories for You") come from the public news_cache table.
  const { data: rows, error: newsError } = await supabase
    .from("news_cache")
    .select("id,category,ai_headline,ai_summary,original_title,link,source,image_url,published_at,created_at")
    .in("source", urls)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (newsError) throw newsError;

  const stories = (rows || []).map((row, index) => ({
    ...mapArticle(row, index),
    category: sourceCategoryMap.get(row.source) || row.category || "General",
  }));
  return { categories: publicRows, stories };
}

function StoryCard({ story, onOpen, saved, onToggleSave }) {
  return (
    <article className="story-card">
      <div className="story-image-wrapper">
        <button
          className="story-image-button"
          type="button"
          onClick={() => onOpen(story)}
          aria-label={`Read ${story.title}`}
        >
          {story.image ? (
            <img
              className="story-image"
              src={story.image}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="story-image story-image-placeholder">
              <ImageIcon size={28} />
            </span>
          )}
        </button>
        <button
          type="button"
          className={`icon-button save-button${saved ? " is-saved" : ""}`}
          onClick={() => onToggleSave(story)}
          aria-label={saved ? "Remove bookmark" : "Bookmark story"}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="story-card-content">
        <button type="button" className="story-title-button" onClick={() => onOpen(story)}>
          {story.title}
        </button>
        <div className="story-byline">
          <span>{story.author}</span>
          <span className="meta-dot">·</span>
          <span>{story.time}</span>
        </div>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("Your Stories");
  const [categoryView, setCategoryView] = useState("feed");
  const [activeTopic, setActiveTopic] = useState("All Topics");
  const [search, setSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const [savedStories, setSavedStories] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [journals, setJournals] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalsError, setJournalsError] = useState("");
  const [selectedStory, setSelectedStory] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [storiesData, setStoriesData] = useState([]);
  const [publicCategories, setPublicCategories] = useState([]);
  const [publicStoriesData, setPublicStoriesData] = useState([]);
  const [followedCategories, setFollowedCategories] = useState([]);
  const [trendsData, setTrendsData] = useState([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [feedMessage, setFeedMessage] = useState("Loading your personalized news...");
  const [userEmail, setUserEmail] = useState("");
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [mediaName, setMediaName] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCategory, setMediaCategory] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaSuccess, setMediaSuccess] = useState("");
  const [copiedJournalId, setCopiedJournalId] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onPointerDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setAccountOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  // Lock page scroll behind any open dialog (important on phones).
  useEffect(() => {
    if (!(showAddMedia || showChangePassword || selectedStory)) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [showAddMedia, showChangePassword, selectedStory]);

  // ---------- Saved stories (stored in Supabase table `saved_stories`) ----------
  const loadSavedStories = useCallback(async () => {
    setSavedLoading(true);
    setSavedMessage("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) {
        setSavedStories([]);
        return;
      }
      const { data, error } = await supabase
        .from("saved_stories")
        .select("story_id, story_data, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSavedStories(
        (data || []).map((row) => ({
          ...row.story_data,
          id: row.story_id,
        }))
      );
    } catch (error) {
      console.error("Failed to load saved stories:", error);
      setSavedMessage("Could not load your saved stories.");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  const savedIds = useMemo(
    () => savedStories.map((story) => String(story.id)),
    [savedStories]
  );

  const toggleSave = useCallback(
    async (story) => {
      const storyId = String(story.id);
      const isSaved = savedStories.some((item) => String(item.id) === storyId);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user;
        if (!user) {
          setSavedMessage("Please sign in to save stories.");
          return;
        }
        setSavedMessage("");
        // Optimistic UI update so the bookmark responds instantly.
        setSavedStories((current) =>
          isSaved
            ? current.filter((item) => String(item.id) !== storyId)
            : [{ ...story, id: storyId }, ...current]
        );
        if (isSaved) {
          const { error } = await supabase
            .from("saved_stories")
            .delete()
            .eq("user_id", user.id)
            .eq("story_id", storyId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("saved_stories")
            .upsert(
              { user_id: user.id, story_id: storyId, story_data: story },
              { onConflict: "user_id,story_id" }
            );
          if (error) throw error;
        }
      } catch (error) {
        console.error("Failed to update saved stories:", error);
        setSavedMessage("Could not update your saved stories.");
        // Resync with the database to undo the optimistic change.
        loadSavedStories();
      }
    },
    [savedStories, loadSavedStories]
  );

  useEffect(() => {
    loadSavedStories();
    // Reload when the user signs in or out.
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => loadSavedStories(), 0);
    });
    return () => listener?.subscription?.unsubscribe();
  }, [loadSavedStories]);

  // ---------- Dashboard feed ----------
  const loadDashboardData = useCallback(async () => {
    setLoadingStories(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      setUserEmail(user?.email || "Reader");
      if (!user) {
        setFeeds([]);
        setStoriesData([]);
        setPublicCategories([]);
        setPublicStoriesData([]);
        setFollowedCategories([]);
        setTrendsData([]);
        setFeedMessage("Sign in to see your personalized news.");
        return;
      }
      const [rssResult, sourceResult, personalizedTrends, publicFeed] = await Promise.all([
        supabase.from("rss").select("id,name,category,rss_url"),
        supabase.from("user_sources").select("rss_id").eq("user_id", user.id),
        loadPersonalizedTrends(user.id),
        loadPublicCategoryStories(),
      ]);
      if (rssResult.error) throw rssResult.error;
      if (sourceResult.error) throw sourceResult.error;
      setFollowedCategories(personalizedTrends.categories);
      setTrendsData(personalizedTrends.trends);
      setPublicCategories(publicFeed.categories);
      setPublicStoriesData(publicFeed.stories);
      const selectedIds = new Set((sourceResult.data || []).map((row) => row.rss_id));
      const chosenFeeds = (rssResult.data || []).filter((row) => selectedIds.has(row.id));
      setFeeds(chosenFeeds);
      const selectedUrls = [...new Set(chosenFeeds.map((feed) => feed.rss_url).filter(Boolean))];
      let articleRows = [];
      if (selectedUrls.length) {
        // "Your Stories" reads from the private news cache table.
        const { data, error: articleError } = await supabase
          .from(PRIVATE_NEWS_TABLE)
          .select("id,category,ai_headline,ai_summary,original_title,link,source,image_url,published_at,created_at")
          .in("source", selectedUrls)
          // .eq("user_id", user.id) // uncomment if the private table has a user_id column
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(60);
        if (articleError) throw articleError;
        articleRows = data || [];
      }
      const mapped = articleRows.map(mapArticle);
      setStoriesData(mapped);
      setFeedMessage(mapped.length
        ? `Loaded ${mapped.length} articles from ${chosenFeeds.length} selected sources.`
        : "No articles found for this feed yet. Run the backend news pipeline first.");
    } catch (error) {
      console.error("Failed to load dashboard news from Supabase:", error);
      setStoriesData([]);
      setPublicCategories([]);
      setPublicStoriesData([]);
      setFollowedCategories([]);
      setTrendsData([]);
      setFeedMessage("Could not load news. Check Supabase access policies and table columns.");
    } finally {
      setLoadingStories(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // Load journals (all RSS sources) from the database when the Journals view opens.
  useEffect(() => {
    if (categoryView !== "journals") return undefined;
    let cancelled = false;
    (async () => {
      setJournalsLoading(true);
      setJournalsError("");
      const { data, error } = await supabase
        .from("rss")
        .select("id,name,category,rss_url")
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load journals:", error);
        setJournalsError("Could not load journals. Check your Supabase access policies.");
        setJournals([]);
      } else {
        setJournals(data || []);
      }
      setJournalsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [categoryView]);

  async function handleChangePassword(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all fields.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("Choose a password different from your current one.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = data.user;
      if (!user?.email) throw new Error("Please sign in again.");
      // Verify the current password.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Your current password is incorrect.");
      // Update the password through Supabase Auth.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(error.message || "Unable to change your password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  const stories = useMemo(() => {
    let result;
    if (activeTab === "Trending Stories") result = [...trendsData];
    else if (activeTab === "Stories for You") result = [...publicStoriesData];
    else result = [...storiesData];

    if (activeTab === "Trending Stories") {
      result.sort((a, b) => (b.newsScore || 0) - (a.newsScore || 0));
    }
    if (activeTopic !== "All Topics") {
      result = result.filter(
        (story) => (story.category || "").toLowerCase() === activeTopic.toLowerCase()
      );
    }
    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter((story) =>
        `${story.title} ${story.category} ${story.source} ${story.summary}`.toLowerCase().includes(term)
      );
    }
    return result;
  }, [storiesData, publicStoriesData, trendsData, activeTab, activeTopic, search]);

  const featuredStories = useMemo(() => stories.slice(0, 5), [stories]);

  // ---------- Pagination (10 cards per page) ----------
  const [page, setPage] = useState(1);
  const storiesTopRef = useRef(null);
  const totalPages = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedStories = useMemo(
    () => stories.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [stories, currentPage]
  );
  const pageList = useMemo(() => getPageList(currentPage, totalPages), [currentPage, totalPages]);
  // Go back to page 1 whenever the tab, topic or search changes.
  useEffect(() => { setPage(1); }, [activeTab, activeTopic, search]);
  const goToPage = (next) => {
    const target = Math.min(Math.max(1, next), totalPages);
    setPage(target);
    storiesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [slide, setSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const slideCount = featuredStories.length;
  const goToSlide = (index) => { if (slideCount) setSlide(((index % slideCount) + slideCount) % slideCount); };
  useEffect(() => { setSlide(0); }, [activeTab, activeTopic, search, storiesData, publicStoriesData, trendsData]);
  useEffect(() => {
    if (slideCount < 2 || carouselPaused) return undefined;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slideCount), 6000);
    return () => window.clearInterval(timer);
  }, [slideCount, carouselPaused]);

  const pickTopic = (topic) => {
    setCategoryView("feed");
    setActiveTopic(topic);
    // Topic filtering stays on the currently selected feed.
  };

  const openAddMedia = () => {
    setShowAddMedia(true);
    setMediaError("");
    setMediaSuccess("");
    setAccountOpen(false);
  };

  const openChangePassword = () => {
    setShowChangePassword(true);
    setPasswordError("");
    setPasswordSuccess("");
    setAccountOpen(false);
  };

  async function handleAddMedia(event) {
    event.preventDefault();
    setMediaError("");
    setMediaSuccess("");
    const name = mediaName.trim();
    const rssUrl = mediaUrl.trim();
    const categoryName = mediaCategory.trim();
    if (!name || !rssUrl || !categoryName) {
      setMediaError("Enter a source name, RSS URL, and category.");
      return;
    }
    let parsedUrl;
    try { parsedUrl = new URL(rssUrl); } catch {
      setMediaError("Enter a valid RSS URL.");
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      setMediaError("Please use an HTTPS RSS URL.");
      return;
    }
    const endpoint = import.meta.env.VITE_RSS_VALIDATOR_URL;
    if (!endpoint) {
      setMediaError("Missing VITE_RSS_VALIDATOR_URL in your .env file.");
      return;
    }
    setMediaBusy(true);
    try {
      const validation = await new Promise((resolve, reject) => {
        const callbackName = `rssValidation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => finish(new Error("RSS validation timed out. Please try again.")), 20000);
        function cleanup() {
          window.clearTimeout(timeout);
          script.remove();
          try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
        }
        function finish(error, result) {
          cleanup();
          if (error) reject(error);
          else resolve(result);
        }
        window[callbackName] = (result) => finish(null, result);
        script.onerror = () => finish(new Error("Could not reach the RSS validator. Check its URL and access settings."));
        const separator = endpoint.includes("?") ? "&" : "?";
        script.src = `${endpoint}${separator}url=${encodeURIComponent(parsedUrl.href)}&callback=${encodeURIComponent(callbackName)}`;
        document.head.appendChild(script);
      });
      if (!validation?.valid) throw new Error(validation?.message || "This URL is not a valid RSS or Atom feed.");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) throw new Error("Please sign in before adding a source.");
      let categoryId;
      const { data: existingCategory, error: categoryLookupError } = await supabase
        .from("categories").select("id,name,visibility").eq("owner_id", user.id).ilike("name", categoryName).maybeSingle();
      if (categoryLookupError) throw categoryLookupError;
      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory, error: categoryInsertError } = await supabase
          .from("categories").insert({ owner_id: user.id, name: categoryName, visibility: "private" }).select("id").single();
        if (categoryInsertError) throw categoryInsertError;
        categoryId = newCategory.id;
      }
      const { data: existingFeed, error: feedLookupError } = await supabase
        .from("rss").select("id,name,category,rss_url").eq("rss_url", parsedUrl.href).maybeSingle();
      if (feedLookupError) throw feedLookupError;
      let feed = existingFeed;
      if (!feed) {
        const { data: createdFeed, error: feedInsertError } = await supabase
          .from("rss").insert({ name, category: categoryName, category_id: categoryId, rss_url: parsedUrl.href })
          .select("id,name,category,rss_url").single();
        if (feedInsertError) throw feedInsertError;
        feed = createdFeed;
      }
      const { error: selectionError } = await supabase.from("user_sources").upsert(
        { user_id: user.id, rss_id: feed.id }, { onConflict: "user_id,rss_id" },
      );
      if (selectionError) throw selectionError;
      setMediaSuccess(`Feed verified and added to “${categoryName}”. Run the news pipeline to collect its articles.`);
      setMediaName("");
      setMediaUrl("");
      setMediaCategory("");
      await loadDashboardData();
    } catch (error) {
      console.error("Unable to add RSS source:", error);
      setMediaError(error.message || "Could not add this RSS source.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Unable to sign out:", error);
      setFeedMessage("Could not sign out. Please try again.");
      return;
    }
    window.location.assign("/login");
  }

  const topbarLabels = {
    public: "Public Categories",
    manage: "Manage Categories",
    journals: "Journals",
    saved: "Saved Newsletters",
  };
  const displayName = userEmail === "Reader" ? "Your account" : userEmail?.split("@")[0] || "Your account";
  const initial = (userEmail?.[0] || "R").toUpperCase();
  const navItems = [
    { key: "feed", label: "Dashboard", icon: LayoutDashboard },
    { key: "journals", label: "Journals", icon: BookOpen },
    { key: "public", label: "Public", icon: Globe2 },
    { key: "manage", label: "Manage", icon: FolderCog },
  ];

  return (
    <div className="news-dashboard">
      {/* ---------- Top navigation ---------- */}
      <header className="app-header">
        <div className="app-header-inner">
          <button type="button" className="nav-brand" onClick={() => setCategoryView("feed")} aria-label="Elinity home">
            <span className="brand-name">
              <span className="special-e" aria-label="E">
                <span></span>
                <span></span>
                <span></span>
              </span>
              linity
            </span>
          </button>
          <nav className="nav-links" aria-label="Main navigation">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`nav-link${categoryView === key ? " active" : ""}`}
                aria-current={categoryView === key ? "page" : undefined}
                onClick={() => setCategoryView(key)}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="nav-spacer" />
          <button type="button" className="nav-add-button" onClick={openAddMedia}>
            <Plus size={15} /> <span>Add source</span>
          </button>
          <button
            type="button"
            className={`nav-icon-button${categoryView === "saved" ? " active" : ""}`}
            onClick={() => setCategoryView("saved")}
            aria-label={`Saved newsletters (${savedStories.length})`}
          >
            <Bookmark size={18} />
            {savedStories.length > 0 && <span className="nav-badge">{savedStories.length}</span>}
          </button>
          <div className="account-menu" ref={accountRef}>
            <button
              type="button"
              className="account-trigger"
              onClick={() => setAccountOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              aria-label="Account menu"
            >
              <span className="avatar" aria-hidden="true">{initial}</span>
              <ChevronDown size={14} className={accountOpen ? "flip" : ""} />
            </button>
            {accountOpen && (
              <div className="account-popover" role="menu">
                <div className="account-head">
                  <span className="avatar" aria-hidden="true">{initial}</span>
                  <div>
                    <strong>{displayName}</strong>
                    <span>{userEmail && userEmail !== "Reader" ? userEmail : "Personal news feed"}</span>
                  </div>
                </div>
                <div className="account-divider" />
                <button type="button" role="menuitem" className="account-item account-item-mobile" onClick={openAddMedia}>
                  <Newspaper size={16} /> Add RSS Source
                </button>
                <button type="button" role="menuitem" className="account-item" onClick={() => { setCategoryView("saved"); setAccountOpen(false); }}>
                  <Bookmark size={16} /> Saved Newsletters{savedStories.length ? ` (${savedStories.length})` : ""}
                </button>
                <button type="button" role="menuitem" className="account-item" onClick={openChangePassword}>
                  <LockKeyhole size={16} /> Change Password
                </button>
                <div className="account-divider" />
                <button type="button" role="menuitem" className="account-item danger" onClick={handleLogout}>
                  <LogOut size={16} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Sub-bar: feed views + quick topic filters */}
        <div className="app-subbar">
          {categoryView === "feed" ? (
            <>
              <nav className="feed-tabs" aria-label="News feed views">
                {["Your Stories", "Trending Stories", "Stories for You"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`feed-tab${activeTab === tab ? " active" : ""}`}
                    onClick={() => { setActiveTab(tab); setActiveTopic("All Topics"); }}
                  >
                    {tab === "Trending Stories" && <TrendingUp size={15} />}
                    {tab === "Stories for You" && <Globe2 size={15} />}
                    {tab}
                  </button>
                ))}
              </nav>
              <div className="subbar-chips" role="group" aria-label="Quick topic filters">
                {["All Topics", ...publicCategories.map((category) => category.name)].filter((topic, index, topics) => topics.findIndex((item) => item.toLowerCase() === topic.toLowerCase()) === index).map((topic) => {
                  const TopicIcon = TOPIC_ICONS[topic.toLowerCase()];
                  return (
                    <button
                      key={topic}
                      type="button"
                      className={`chip${activeTopic === topic ? " active" : ""}`}
                      aria-pressed={activeTopic === topic}
                      onClick={(event) => {
                        pickTopic(topic);
                        event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                      }}
                    >
                      {TopicIcon && <TopicIcon size={14} strokeWidth={2} />}
                      {topic}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="category-topbar-label">{topbarLabels[categoryView]}</div>
          )}
        </div>
      </header>
      <main className="dashboard-main">
        {categoryView === "journals" ? (
          <div className="dashboard-content">
            <section className="feed-column">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">FROM OUR DATABASE</span>
                  <h2>Journals</h2>
                </div>
                <span className="story-count">{journals.length} sources</span>
              </div>
              {journalsLoading && <div className="empty-state"><p>Loading journals...</p></div>}
              {journalsError && <div className="empty-state"><p>{journalsError}</p></div>}
              {!journalsLoading && !journalsError && journals.length === 0 && (
                <div className="empty-state">
                  <Newspaper size={28} />
                  <h3>No journals yet</h3>
                  <p>No RSS sources exist in the database.</p>
                </div>
              )}
              {!journalsLoading && !journalsError && journals.length > 0 && (
                <div className="story-grid">
                  {journals.map((j) => {
                    let host = j.rss_url;
                    try {
                      host = new URL(j.rss_url).hostname.replace(/^www\./i, "");
                    } catch {
                      // Keep the raw URL if it is invalid.
                    }
                    return (
                      <article className="story-card" key={j.id}>
                        <div className="story-card-content">
                          <div className="story-meta-top"><span>{j.category || "General"}</span></div>
                          <button
                            type="button"
                            className="story-title-button"
                            title="Click to copy RSS link"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(j.rss_url);
                                setCopiedJournalId(j.id);
                                setTimeout(() => setCopiedJournalId(null), 2000);
                              } catch (error) {
                                console.error("Failed to copy RSS link:", error);
                              }
                            }}
                          >
                            {j.name}
                          </button>
                          <div className="story-byline"><span>{host}</span></div>
                          {copiedJournalId === j.id && (
                            <div className="journal-copy-feedback"><span>✓</span> RSS link copied</div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : categoryView === "saved" ? (
          <div className="dashboard-content">
            <section className="feed-column">
              <div className="section-heading">
                <div><span className="eyebrow">YOUR READING LIST</span><h2>Saved Newsletters</h2></div>
                <span className="story-count">{savedStories.length} saved</span>
              </div>
              {savedLoading && (
                <div className="empty-state"><p>Loading saved stories...</p></div>
              )}
              {savedMessage && (
                <div className="empty-state"><p>{savedMessage}</p></div>
              )}
              {!savedLoading && savedStories.length === 0 && (
                <div className="empty-state">
                  <Bookmark size={28} />
                  <h3>Nothing saved yet</h3>
                  <p>Tap the bookmark icon on any story to save it here.</p>
                </div>
              )}
              {savedStories.length > 0 && (
                <div className="story-grid">
                  {savedStories.map((story) => (
                    <StoryCard key={story.id} story={story} onOpen={setSelectedStory} saved onToggleSave={toggleSave} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : categoryView !== "feed" ? (
          <CategoriesPanel mode={categoryView} onBack={() => setCategoryView("feed")} onCategorySelect={() => { setCategoryView("feed"); loadDashboardData(); }} />
        ) : (
          <div className="dashboard-content">
            <section className="feed-column">
              <div className="mobile-greeting"><span className="eyebrow">YOUR DAILY BRIEFING</span><h1>Stories worth your time.</h1></div>
              {featuredStories.length ? (
                <div
                  className="featured-carousel"
                  role="region"
                  aria-roledescription="carousel"
                  aria-label="Featured stories"
                  onMouseEnter={() => setCarouselPaused(true)}
                  onMouseLeave={() => setCarouselPaused(false)}
                  onFocus={() => setCarouselPaused(true)}
                  onBlur={() => setCarouselPaused(false)}
                >
                  <div className="featured-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
                    {featuredStories.map((story, index) => {
                      const active = index === slide;
                      const isSaved = savedIds.includes(String(story.id));
                      return (
                        <article
                          className="featured-story"
                          key={story.id}
                          aria-hidden={!active}
                          aria-label={`${index + 1} of ${slideCount}`}
                          style={{ backgroundImage: `linear-gradient(90deg, rgba(0, 0, 0, .88), rgba(0, 0, 0, .1)), linear-gradient(0deg, rgba(0, 0, 0, .6), transparent 70%)${story.image ? `, url("${story.image}")` : ""}` }}
                        >
                          <div className="featured-content">
                            <h1>{story.title}</h1>
                            <div className="featured-byline"><span className="author-avatar">E</span><span>{story.author}</span><span>·</span><span>{story.category}</span></div>
                            <p>{story.summary}</p>
                            <button type="button" tabIndex={active ? 0 : -1} className="read-featured-button" onClick={() => setSelectedStory(story)}>Read story <ChevronRight size={16} /></button>
                          </div>
                          <button type="button" tabIndex={active ? 0 : -1} className={`featured-save icon-button${isSaved ? " is-saved" : ""}`} onClick={() => toggleSave(story)} aria-label="Bookmark featured story"><Bookmark size={18} fill={isSaved ? "currentColor" : "none"} /></button>
                        </article>
                      );
                    })}
                  </div>
                  {slideCount > 1 && (
                    <div className="carousel-controls">
                      <button type="button" className="carousel-arrow" onClick={() => goToSlide(slide - 1)} aria-label="Previous story"><ChevronLeft size={18} /></button>
                      <div className="carousel-dots" role="tablist" aria-label="Choose story">
                        {featuredStories.map((story, index) => (
                          <button key={story.id} type="button" role="tab" aria-selected={index === slide} aria-label={`Go to story ${index + 1}`} className={`carousel-dot${index === slide ? " active" : ""}`} onClick={() => goToSlide(index)} />
                        ))}
                      </div>
                      <button type="button" className="carousel-arrow" onClick={() => goToSlide(slide + 1)} aria-label="Next story"><ChevronRight size={18} /></button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="featured-story featured-empty"><div className="featured-content"><span className="featured-kicker"><Sparkles size={14} /> YOUR DAILY BRIEFING</span><h1>{loadingStories ? "Loading your news..." : "Your next briefing starts here."}</h1><p>{loadingStories ? "Fetching articles from Supabase." : "Choose news sources in Public Categories, then come back here for your personalized feed."}</p>{!loadingStories && <button type="button" className="read-featured-button" onClick={() => setCategoryView("public")}>Explore Public Categories <ChevronRight size={16} /></button>}</div></div>
              )}
              <div className="section-heading" ref={storiesTopRef}><div><span className="eyebrow">CURATED FOR YOU</span><h2>{activeTopic === "All Topics" ? activeTab : activeTopic}</h2></div><span className="story-count">{stories.length} stories <ChevronRight size={15} /></span></div>
              {loadingStories && <div className="empty-state"><p>Loading articles from Supabase...</p></div>}
              <div className="story-grid">{pagedStories.map((story) => <StoryCard key={story.id} story={story} onOpen={setSelectedStory} saved={savedIds.includes(String(story.id))} onToggleSave={toggleSave} />)}</div>
              {totalPages > 1 && (
                <nav className="pagination" aria-label="Story pages">
                  <button type="button" className="page-btn page-nav" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page"><ChevronLeft size={16} /> <span>Prev</span></button>
                  <div className="page-numbers">
                    {pageList.map((item, index) => item === "…"
                      ? <span key={`gap-${index}`} className="page-gap" aria-hidden="true">…</span>
                      : <button key={item} type="button" className={`page-btn${item === currentPage ? " active" : ""}`} onClick={() => goToPage(item)} aria-label={`Page ${item}`} aria-current={item === currentPage ? "page" : undefined}>{item}</button>)}
                  </div>
                  <button type="button" className="page-btn page-nav" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page"><span>Next</span> <ChevronRight size={16} /></button>
                  <span className="page-summary">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, stories.length)} of {stories.length}</span>
                </nav>
              )}
              {!loadingStories && stories.length === 0 && <div className="empty-state"><Search size={28} /><h3>No articles found</h3><p>{search ? "Try another search or choose a different topic." : "No public or selected-source news is available yet."}</p><button type="button" onClick={() => { setSearch(""); setActiveTopic("All Topics"); }}>Clear filters</button></div>}
              <p className="data-notice"><Activity size={14} /> {feedMessage}</p>
            </section>
            <aside className="dashboard-rightbar">
              <section className="rightbar-section"><div className="rightbar-heading"><h2>Latest News</h2><button type="button" className="text-link" onClick={() => { setActiveTab("Your Stories"); setActiveTopic("All Topics"); }}>View all</button></div>
                {stories.slice(0, 4).map((story) => <button type="button" className="latest-story" key={story.id} onClick={() => setSelectedStory(story)}>{story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="latest-image-placeholder"><ImageIcon size={18} /></span>}<span className="latest-copy"><strong>{story.title}</strong><span>{story.category} · {story.time}</span></span></button>)}
              </section>
              <section className="sources-widget"><div className="sources-widget-icon"><Newspaper size={18} /></div><div><strong>Your sources</strong><p>{feeds.length ? `${feeds.length} RSS sources selected` : "Choose sources in Public Categories"}</p></div><button type="button" className="icon-button" onClick={() => setCategoryView("public")} aria-label="Choose news sources"><ChevronRight size={18} /></button></section>
              <div className="rightbar-footer">Made for curious minds <span>·</span> Elinity</div>
            </aside>
          </div>
        )}
      </main>
      {/* ---------- Mobile bottom dock ---------- */}
      <nav className="bottom-dock" aria-label="Quick navigation">
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`dock-item${categoryView === key ? " active" : ""}`}
            onClick={() => setCategoryView(key)}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`dock-item${categoryView === "saved" ? " active" : ""}`}
          onClick={() => setCategoryView("saved")}
        >
          <Bookmark size={20} strokeWidth={1.8} />
          <span>Saved</span>
        </button>
      </nav>
      {showAddMedia && <div className="reader-backdrop add-media-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !mediaBusy) setShowAddMedia(false); }}>
        <section className="article-reader add-media-dialog" role="dialog" aria-modal="true" aria-labelledby="add-media-title">
          <button className="reader-close icon-button" type="button" onClick={() => setShowAddMedia(false)} aria-label="Close add source form" disabled={mediaBusy}><X size={21} /></button>
          <div className="reader-body"><span className="eyebrow">PERSONALIZE YOUR NEWS</span><h2 id="add-media-title">Add an RSS source</h2><p>Verify an RSS or Atom feed, then add it to your personal source selection.</p>
            <form className="add-media-form" onSubmit={handleAddMedia}>
              <label>Source name<input value={mediaName} onChange={(event) => setMediaName(event.target.value)} placeholder="e.g. The Hindu Technology" required maxLength={100} /></label>
              <label>RSS / Atom URL<input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://example.com/rss.xml" required /></label>
              <label>Category name<input value={mediaCategory} onChange={(event) => setMediaCategory(event.target.value)} placeholder="e.g. AI Research, Cricket, Local News" required maxLength={60} /></label>
              {mediaError && <p role="alert" className="add-media-message error">{mediaError}</p>}
              {mediaSuccess && <p role="status" className="add-media-message success">{mediaSuccess}</p>}
              <button className="read-featured-button add-media-submit" type="submit" disabled={mediaBusy}>{mediaBusy ? "Verifying feed..." : "Verify and add source"}</button>
            </form>
            <p className="add-media-note">The feed must be publicly accessible over HTTPS. Your backend pipeline must run to collect articles.</p>
          </div>
        </section>
      </div>}
      {showChangePassword && (
        <div
          className="reader-backdrop add-media-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !passwordBusy) setShowChangePassword(false);
          }}
        >
          <section className="article-reader add-media-dialog password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
            <button
              type="button"
              className="reader-close icon-button"
              onClick={() => setShowChangePassword(false)}
              aria-label="Close change password"
              disabled={passwordBusy}
            >
              <X size={21} />
            </button>
            <div className="reader-body">
              <span className="eyebrow">ACCOUNT SECURITY</span>
              <h2 id="password-dialog-title">Change Password</h2>
              <p>Choose a new password to secure your account.</p>
              <form className="add-media-form change-password-form" onSubmit={handleChangePassword}>
                <label>
                  Current password
                  <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                </label>
                <label>
                  New password
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
                </label>
                {passwordError && <p className="add-media-message error" role="alert">{passwordError}</p>}
                {passwordSuccess && <p className="add-media-message success" role="status">{passwordSuccess}</p>}
                <button type="submit" className="read-featured-button add-media-submit password-submit" disabled={passwordBusy}>
                  {passwordBusy ? "Updating password..." : "Update Password"}
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
      {selectedStory && <div className="reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStory(null); }}>
        <section className="article-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title">
          <button type="button" className="reader-close icon-button" onClick={() => setSelectedStory(null)} aria-label="Close article"><X size={21} /></button>
          {selectedStory.image && <img className="reader-image" src={selectedStory.image} alt="" />}
          <div className="reader-body"><span className="eyebrow">{selectedStory.category}</span><h2 id="reader-title">{selectedStory.title}</h2><div className="reader-byline">{selectedStory.author} <span>·</span> {selectedStory.time}</div><p>{selectedStory.summary}</p>
            {selectedStory.link && <a className="reader-save-button" href={selectedStory.link} target="_blank" rel="noreferrer">Read original article <ChevronRight size={16} /></a>}
            <button type="button" className="reader-save-button" onClick={() => toggleSave(selectedStory)}><Bookmark size={16} fill={savedIds.includes(String(selectedStory.id)) ? "currentColor" : "none"} />{savedIds.includes(String(selectedStory.id)) ? "Saved to reading list" : "Save to reading list"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}