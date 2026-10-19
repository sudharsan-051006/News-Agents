import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderCog,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import CategoriesPanel from "./CategoriesPanel";
import "../styles/Dashboard.css";

const TOPICS = ["geopolitics", "local", "movies", "sports", "tech"];
const SAVED_KEY = "elinity_saved_news";

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

function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SidebarLink({ icon: Icon, children, onClick, active, to }) {
  const className = `dashboard-nav-link${active ? " active" : ""}`;
  if (to) {
    return (
      <NavLink to={to} onClick={onClick} className={({ isActive }) => `${className}${isActive ? " active" : ""}`}>
        <Icon size={18} strokeWidth={1.8} /> <span>{children}</span>
      </NavLink>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      <Icon size={18} strokeWidth={1.8} /> <span>{children}</span>
    </button>
  );
}

function StoryCard({ story, onOpen, saved, onToggleSave }) {
  return (
    <article className="story-card">
      <button className="story-image-button" type="button" onClick={() => onOpen(story)} aria-label={`Read ${story.title}`}>
        {story.image ? (
          <img className="story-image" src={story.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        ) : <span className="story-image story-image-placeholder"><ImageIcon size={28} /></span>}
      </button>
      <div className="story-card-content">
        <div className="story-meta-top">
          <span>{story.category}</span>
          <button type="button" className={`icon-button save-button${saved ? " is-saved" : ""}`} onClick={() => onToggleSave(story)} aria-label={saved ? "Remove bookmark" : "Bookmark story"}>
            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
        <button type="button" className="story-title-button" onClick={() => onOpen(story)}>{story.title}</button>
        <div className="story-byline"><span>{story.author}</span><span className="meta-dot">·</span><span>{story.time}</span></div>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("Stories for You");
  const [categoryView, setCategoryView] = useState("feed");
  const [activeTopic, setActiveTopic] = useState("All topics");
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [savedStories, setSavedStories] = useState(readSaved);
  const savedIds = useMemo(() => savedStories.map((s) => s.id), [savedStories]);
  const [journals, setJournals] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalsError, setJournalsError] = useState("");
  const [selectedStory, setSelectedStory] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [storiesData, setStoriesData] = useState([]);
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

  // Persist saved stories to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(savedStories));
    } catch (error) {
      console.error("Could not save to localStorage:", error);
    }
  }, [savedStories]);

  const toggleSave = (story) =>
    setSavedStories((current) =>
      current.some((s) => s.id === story.id)
        ? current.filter((s) => s.id !== story.id)
        : [story, ...current],
    );

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
        setFeedMessage("Sign in to see your personalized news.");
        return;
      }

      const [rssResult, sourceResult] = await Promise.all([
        supabase.from("rss").select("id,name,category,rss_url"),
        supabase.from("user_sources").select("rss_id").eq("user_id", user.id),
      ]);
      if (rssResult.error) throw rssResult.error;
      if (sourceResult.error) throw sourceResult.error;

      const selectedIds = new Set((sourceResult.data || []).map((row) => row.rss_id));
      const chosenFeeds = (rssResult.data || []).filter((row) => selectedIds.has(row.id));
      setFeeds(chosenFeeds);
      const selectedUrls = [...new Set(chosenFeeds.map((feed) => feed.rss_url).filter(Boolean))];
      if (!selectedUrls.length) {
        setStoriesData([]);
        setFeedMessage("Choose the sources you want in Public Categories to personalize your news.");
        return;
      }

      const { data: articleRows, error: articleError } = await supabase
        .from("news_cache")
        .select("id,category,ai_headline,ai_summary,original_title,link,source,image_url,published_at,created_at")
        .in("source", selectedUrls)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(60);
      if (articleError) throw articleError;
      const mapped = (articleRows || []).map(mapArticle);
      setStoriesData(mapped);
      setFeedMessage(mapped.length
        ? `Loaded ${mapped.length} articles from ${chosenFeeds.length} selected sources.`
        : "No cached articles found for your selected sources yet. Run the backend news pipeline first.");
    } catch (error) {
      console.error("Failed to load dashboard news from Supabase:", error);
      setStoriesData([]);
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

  const stories = useMemo(() => {
    let result = [...storiesData];
    if (activeTab === "Trending") result = [...result].reverse();
    if (activeTopic !== "All topics") {
      result = result.filter((story) => story.category.toLowerCase() === activeTopic.toLowerCase());
    }
    const term = search.trim().toLowerCase();
    if (term) result = result.filter((story) => `${story.title} ${story.category} ${story.source} ${story.summary}`.toLowerCase().includes(term));
    return result;
  }, [storiesData, activeTab, activeTopic, search]);

  const featuredStories = useMemo(() => stories.slice(0, 5), [stories]);
  const [slide, setSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const slideCount = featuredStories.length;
  const goToSlide = (index) => { if (slideCount) setSlide(((index % slideCount) + slideCount) % slideCount); };

  useEffect(() => { setSlide(0); }, [activeTab, activeTopic, search, storiesData]);
  useEffect(() => {
    if (slideCount < 2 || carouselPaused) return undefined;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slideCount), 6000);
    return () => window.clearInterval(timer);
  }, [slideCount, carouselPaused]);

  const pickTopic = (topic) => {
    setActiveTopic(topic);
    setActiveTab("Stories for You");
    setMobileNavOpen(false);
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

  return (
    <div className="news-dashboard">
      <aside className={`dashboard-sidebar${mobileNavOpen ? " mobile-open" : ""}`} aria-label="Dashboard sidebar">
        <div className="brand-lockup">
          {/* <span className="brand-mark" aria-hidden="true"><Sparkles size={21} /></span> */}
          <span className="brand-name"><span style={{ fontWeight: "bold", color: "Red", fontFamily: "Lucida Console" }}>E</span>linity</span>
          <button type="button" className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <SidebarLink icon={LayoutDashboard} active={categoryView === "feed"} onClick={() => { setCategoryView("feed"); setMobileNavOpen(false); }}>Dashboard</SidebarLink>
          <SidebarLink icon={BookOpen} active={categoryView === "journals"} onClick={() => { setCategoryView("journals"); setMobileNavOpen(false); }}>Journals</SidebarLink>
          <SidebarLink icon={Newspaper} onClick={() => { setShowAddMedia(true); setMediaError(""); setMediaSuccess(""); setMobileNavOpen(false); }}>Add RSS Source</SidebarLink>
        </nav>

        <div className="sidebar-divider" />
        <section className="topic-section" aria-labelledby="topic-nav-heading">
          <div id="topic-nav-heading" className="topic-nav-label">Explore topics</div>
          <nav className="topic-nav" aria-label="Topic navigation">
            <button type="button" className={`topic-link topic-feature-link${categoryView === "public" ? " active" : ""}`} aria-current={categoryView === "public" ? "page" : undefined} onClick={() => { setCategoryView("public"); setMobileNavOpen(false); }}>
              <Globe2 size={17} aria-hidden="true" /><span>Public Categories</span>
            </button>
            <button type="button" className={`topic-link topic-feature-link${categoryView === "manage" ? " active" : ""}`} aria-current={categoryView === "manage" ? "page" : undefined} onClick={() => { setCategoryView("manage"); setMobileNavOpen(false); }}>
              <FolderCog size={17} aria-hidden="true" /><span>Manage Categories</span>
            </button>
            <div className="topic-nav-subheading">QUICK FILTERS</div>
            <div className="topic-filter-list">
              {TOPICS.map((topic) => {
                const isActive = categoryView === "feed" && activeTopic === topic;
                return <button key={topic} type="button" className={`topic-link${isActive ? " active" : ""}`} aria-current={isActive ? "true" : undefined} onClick={() => { setCategoryView("feed"); pickTopic(topic); }}><span className="topic-link-text">{topic}</span></button>;
              })}
            </div>
          </nav>
        </section>

        <div className="sidebar-bottom">
          <SidebarLink icon={Bookmark} active={categoryView === "saved"} onClick={() => { setCategoryView("saved"); setMobileNavOpen(false); }}>Saved Newsletters{savedStories.length ? ` (${savedStories.length})` : ""}</SidebarLink>
          <button type="button" className="dashboard-nav-link" onClick={handleLogout}><LogOut size={18} strokeWidth={1.8} /><span>Log out</span></button>
          <div className="user-mini">
            <div className="avatar" aria-hidden="true">{(userEmail?.[0] || "R").toUpperCase()}</div>
            <div className="user-mini-copy"><strong>{userEmail === "Reader" ? "Your account" : userEmail?.split("@")[0] || "Your account"}</strong><span>Personal news feed</span></div>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button type="button" className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <button type="button" className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          {categoryView === "feed" ? (
            <nav className="feed-tabs" aria-label="News feed views">
              {["Stories for You", "Trending", "Your Topics"].map((tab) => <button key={tab} type="button" className={`feed-tab${activeTab === tab ? " active" : ""}`} onClick={() => { setActiveTab(tab); if (tab === "Your Topics") setActiveTopic("All topics"); }}>{tab === "Trending" && <TrendingUp size={15} />}{tab === "Your Topics" && <Zap size={15} />}{tab}</button>)}
            </nav>
          ) : <div className="category-topbar-label">{topbarLabels[categoryView]}</div>}
        </header>

        {categoryView === "journals" ? (
          <div className="dashboard-content">
            <section className="feed-column">
              <div className="section-heading">
                <div><span className="eyebrow">FROM OUR DATABASE</span><h2>Journals</h2></div>
                <span className="story-count">{journals.length} sources</span>
              </div>
              {journalsLoading && <div className="empty-state"><p>Loading journals...</p></div>}
              {journalsError && <div className="empty-state"><p>{journalsError}</p></div>}
              {!journalsLoading && !journalsError && journals.length === 0 && (
                <div className="empty-state"><Newspaper size={28} /><h3>No journals yet</h3><p>No RSS sources exist in the database.</p></div>
              )}
              <div className="story-grid">
                {journals.map((j) => {
                  let host = j.rss_url;
                  try { host = new URL(j.rss_url).hostname.replace(/^www\./i, ""); } catch { /* keep raw url */ }
                  return (
                    <article className="story-card" key={j.id}>
                      <div className="story-card-content">
                        <div className="story-meta-top"><span>{j.category || "General"}</span></div>
                        <a className="story-title-button" href={j.rss_url} target="_blank" rel="noreferrer">{j.name}</a>
                        <div className="story-byline"><span>{host}</span></div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : categoryView === "saved" ? (
          <div className="dashboard-content">
            <section className="feed-column">
              <div className="section-heading">
                <div><span className="eyebrow">YOUR READING LIST</span><h2>Saved Newsletters</h2></div>
                <span className="story-count">{savedStories.length} saved</span>
              </div>
              {savedStories.length === 0 ? (
                <div className="empty-state"><Bookmark size={28} /><h3>Nothing saved yet</h3><p>Tap the bookmark icon on any story to save it here.</p></div>
              ) : (
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
                      return (
                        <article
                          className="featured-story"
                          key={story.id}
                          aria-hidden={!active}
                          aria-label={`${index + 1} of ${slideCount}`}
                          style={{ backgroundImage: `linear-gradient(90deg, rgba(0, 0, 0, .88), rgba(0, 0, 0, .1)), linear-gradient(0deg, rgba(0, 0, 0, .6), transparent 70%)${story.image ? `, url("${story.image}")` : ""}` }}
                        >
                          <div className="featured-content">
                            {/* <span className="featured-kicker"><Sparkles size={14} /> FEATURED STORY</span> */}
                            <h1>{story.title}</h1>
                            <div className="featured-byline"><span className="author-avatar">E</span><span>{story.author}</span><span>·</span><span>{story.category}</span></div>
                            <p>{story.summary}</p>
                            <button type="button" tabIndex={active ? 0 : -1} className="read-featured-button" onClick={() => setSelectedStory(story)}>Read story <ChevronRight size={16} /></button>
                          </div>
                          <button type="button" tabIndex={active ? 0 : -1} className={`featured-save icon-button${savedIds.includes(story.id) ? " is-saved" : ""}`} onClick={() => toggleSave(story)} aria-label="Bookmark featured story"><Bookmark size={18} fill={savedIds.includes(story.id) ? "currentColor" : "none"} /></button>
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

              <div className="section-heading"><div><span className="eyebrow">CURATED FOR YOU</span><h2>{activeTopic === "All topics" ? activeTab : activeTopic}</h2></div><span className="story-count">{stories.length} stories <ChevronRight size={15} /></span></div>
              {activeTab === "Your Topics" && <div className="topic-pills">{["All topics", ...TOPICS].map((topic) => <button key={topic} type="button" className={`topic-pill${activeTopic === topic ? " active" : ""}`} onClick={() => setActiveTopic(topic)}>{topic}</button>)}</div>}
              {loadingStories && <div className="empty-state"><p>Loading articles from Supabase...</p></div>}
              <div className="story-grid">{stories.map((story) => <StoryCard key={story.id} story={story} onOpen={setSelectedStory} saved={savedIds.includes(story.id)} onToggleSave={toggleSave} />)}</div>
              {!loadingStories && stories.length === 0 && <div className="empty-state"><Search size={28} /><h3>No articles found</h3><p>{search ? "Try another search or choose a different topic." : "No cached news is available for your selected sources yet."}</p><button type="button" onClick={() => { setSearch(""); setActiveTopic("All topics"); }}>Clear filters</button></div>}
              <p className="data-notice"><Activity size={14} /> {feedMessage}</p>
            </section>

            <aside className="dashboard-rightbar">
              <section className="rightbar-section"><div className="rightbar-heading"><h2>Latest News</h2><button type="button" className="text-link" onClick={() => { setActiveTab("Stories for You"); setActiveTopic("All topics"); }}>View all</button></div>
                {stories.slice(0, 4).map((story) => <button type="button" className="latest-story" key={story.id} onClick={() => setSelectedStory(story)}>{story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="latest-image-placeholder"><ImageIcon size={18} /></span>}<span className="latest-copy"><strong>{story.title}</strong><span>{story.category} · {story.time}</span></span></button>)}
              </section>
              <section className="sources-widget"><div className="sources-widget-icon"><Newspaper size={18} /></div><div><strong>Your sources</strong><p>{feeds.length ? `${feeds.length} RSS sources selected` : "Choose sources in Public Categories"}</p></div><button type="button" className="icon-button" onClick={() => setCategoryView("public")} aria-label="Choose news sources"><ChevronRight size={18} /></button></section>
              <div className="rightbar-footer">Made for curious minds <span>·</span> Elinity</div>
            </aside>
          </div>
        )}
      </main>

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

      {selectedStory && <div className="reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStory(null); }}>
        <section className="article-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title">
          <button type="button" className="reader-close icon-button" onClick={() => setSelectedStory(null)} aria-label="Close article"><X size={21} /></button>
          {selectedStory.image && <img className="reader-image" src={selectedStory.image} alt="" />}
          <div className="reader-body"><span className="eyebrow">{selectedStory.category}</span><h2 id="reader-title">{selectedStory.title}</h2><div className="reader-byline">{selectedStory.author} <span>·</span> {selectedStory.time}</div><p>{selectedStory.summary}</p>
            {selectedStory.link && <a className="reader-save-button" href={selectedStory.link} target="_blank" rel="noreferrer">Read original article <ChevronRight size={16} /></a>}
            <button type="button" className="reader-save-button" onClick={() => toggleSave(selectedStory)}><Bookmark size={16} fill={savedIds.includes(selectedStory.id) ? "currentColor" : "none"} />{savedIds.includes(selectedStory.id) ? "Saved to reading list" : "Save to reading list"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}