import { useEffect, useMemo, useState } from "react";

import { NavLink } from "react-router-dom";

import {
  Activity,
  Bookmark,
  ChevronRight,
  FileText,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
  Globe2,
  FolderCog,
} from "lucide-react";

import { supabase } from "../supabaseClient";
import CategoriesPanel from "./CategoriesPanel";

import "../styles/Dashboard.css";

// Articles are loaded from Supabase news_cache and filtered by selected RSS sources.

function validateRssWithAppsScript(url) {
  const endpoint = import.meta.env.VITE_RSS_VALIDATOR_URL;
  if (!endpoint) {
    return Promise.reject(new Error("Missing VITE_RSS_VALIDATOR_URL in your .env file."));
  }

  return new Promise((resolve, reject) => {
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
    script.onerror = () => finish(new Error("Could not reach Google Apps Script. Check the deployed /exec URL and web app access settings."));
    const separator = endpoint.includes("?") ? "&" : "?";
    script.src = `${endpoint}${separator}url=${encodeURIComponent(url)}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  });
}

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
    author = new URL(row.source).hostname.replace(/^www\./i, "");
  } catch {}

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
const TOPICS = [

  "geopolitics",

  "local",

  "movies",

  "sports",

  "tech",

];

function SidebarLink({ icon: Icon, children, to, onClick, active }) {

  const className = `dashboard-nav-link${active ? " active" : ""}`;

  if (to) return <NavLink to={to} className={({ isActive }) => `${className}${isActive ? " active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{children}</span></NavLink>;

  return <button type="button" className={className} onClick={onClick}><Icon size={18} strokeWidth={1.8} /><span>{children}</span></button>;

}

function StoryCard({ story, onOpen, saved, onToggleSave }) {

  return (

    <article className="story-card">

      <button className="story-image-button" type="button" onClick={() => onOpen(story)} aria-label={`Read ${story.title}`}>

        {story.image

          ? <img className="story-image" src={story.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />

          : <span className="story-image story-image-placeholder"><ImageIcon size={28} /></span>}

      </button>

      <div className="story-card-content">

        <div className="story-meta-top"><span>{story.category}</span><button className={`icon-button save-button${saved ? " is-saved" : ""}`} onClick={() => onToggleSave(story.id)} aria-label={saved ? "Remove bookmark" : "Bookmark story"}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /></button></div>

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

  const [savedIds, setSavedIds] = useState([]);

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
  const [mediaVisibility, setMediaVisibility] = useState("private");

  const [mediaBusy, setMediaBusy] = useState(false);

  const [mediaError, setMediaError] = useState("");

  const [mediaSuccess, setMediaSuccess] = useState("");


  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
      setFeedMessage("Unable to log out. Please try again.");
    }
  };
  useEffect(() => {

    let alive = true;

    async function loadDashboardData() {

      setLoadingStories(true);

      try {

        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!alive) return;

        const user = authData?.user;

        setUserEmail(user?.email || "Reader");

        if (!user) {

          setStoriesData([]);

          setFeedMessage("Sign in to see your personalized news.");

          return;

        }

        const [{ data: rssRows, error: rssError }, { data: sourceRows, error: sourceError }] = await Promise.all([

          supabase.from("rss").select("id,name,category,rss_url"),

          supabase.from("user_sources").select("rss_id").eq("user_id", user.id),

        ]);

        if (rssError) throw rssError;

        if (sourceError) throw sourceError;

        if (!alive) return;

        const selectedIds = new Set((sourceRows || []).map((row) => row.rss_id));

        const chosenFeeds = (rssRows || []).filter((row) => selectedIds.has(row.id));

        setFeeds(chosenFeeds);

        const selectedUrls = [...new Set(chosenFeeds.map((feed) => feed.rss_url).filter(Boolean))];

        if (!selectedUrls.length) {

          setStoriesData([]);

          setFeedMessage("Choose RSS sources in Preferences to personalize your news.");

          return;

        }

        // The backend stores the RSS feed URL in news_cache.source and its image in image_url.

        const { data: articleRows, error: articleError } = await supabase

          .from("news_cache")

          .select("id,category,ai_headline,ai_summary,original_title,link,source,image_url,published_at,created_at")

          .in("source", selectedUrls)

          .order("published_at", { ascending: false, nullsFirst: false })

          .limit(60);

        if (articleError) throw articleError;

        if (!alive) return;

        const mapped = (articleRows || []).map(mapArticle);

        setStoriesData(mapped);

        const withImages = mapped.filter((story) => story.image).length;

        setFeedMessage(mapped.length

          ? `Loaded ${mapped.length} live articles from ${chosenFeeds.length} selected sources; ${withImages} have images from Supabase.`

          : "No cached articles found for your selected sources yet. Run the backend news pipeline first.");

      } catch (error) {

        console.error("Failed to load dashboard news from Supabase:", error);

        if (alive) {

          setStoriesData([]);

          setFeedMessage("Could not load news from Supabase. Check news_cache SELECT permissions and table columns.");

        }

      } finally {

        if (alive) setLoadingStories(false);

      }

    }

    loadDashboardData();

    return () => { alive = false; };

  }, []);

  const stories = useMemo(() => {

    let result = [...storiesData];

    if (activeTab === "Trending") result = [...result].reverse();

    if (activeTopic !== "All topics") {

      result = result.filter((story) => story.category.toLowerCase() === activeTopic.toLowerCase());

    }

    const term = search.trim().toLowerCase();

    if (term) result = result.filter((story) =>

      `${story.title} ${story.category} ${story.source} ${story.summary}`.toLowerCase().includes(term)

    );

    return result;

  }, [storiesData, activeTab, activeTopic, search]);

  const featured = stories[0] || null;

  const toggleSave = (id) => setSavedIds((current) => current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id]);

  const pickTopic = (topic) => { setActiveTopic(topic); setActiveTab("Stories for You"); setMobileNavOpen(false); };

  async function handleAddMedia(event) {
    event.preventDefault();
    setMediaError("");
    setMediaSuccess("");

    const name = mediaName.trim();
    const rssUrl = mediaUrl.trim();
    const categoryName = mediaCategory.trim();
    if (!name || !categoryName || !rssUrl) {
      setMediaError("Enter a source name, RSS URL, and category.");
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rssUrl);
    } catch {
      setMediaError("Enter a valid RSS URL.");
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      setMediaError("Please use an HTTPS RSS URL.");
      return;
    }

    setMediaBusy(true);
    try {
      // Google Apps Script validates the feed. No Supabase Edge Function is used.
      const validation = await validateRssWithAppsScript(parsedUrl.href);
      if (!validation?.valid) {
        throw new Error(validation?.message || "This URL is not a valid RSS or Atom feed.");
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user) throw new Error("Please sign in before adding a source.");

      // Find this user's category, or create it with the selected visibility.
      let categoryId;
      const { data: existingCategory, error: categoryLookupError } = await supabase
        .from("categories")
        .select("id, name, visibility")
        .eq("owner_id", user.id)
        .ilike("name", categoryName)
        .maybeSingle();
      if (categoryLookupError) throw categoryLookupError;

      if (existingCategory) {
        categoryId = existingCategory.id;
        // Existing category's visibility is kept; changing visibility should be a separate explicit action.
      } else {
        const { data: newCategory, error: categoryInsertError } = await supabase
          .from("categories")
          .insert({ owner_id: user.id, name: categoryName, visibility: mediaVisibility })
          .select("id, name, visibility")
          .single();
        if (categoryInsertError) throw categoryInsertError;
        categoryId = newCategory.id;
      }

      // Reuse an existing global RSS record when possible; otherwise create one.
      let rssId;
      const { data: existingFeed, error: feedLookupError } = await supabase
        .from("rss")
        .select("id, name, category, rss_url, category_id")
        .eq("rss_url", parsedUrl.href)
        .maybeSingle();
      if (feedLookupError) throw feedLookupError;

      if (existingFeed?.id) {
        rssId = existingFeed.id;
        // Do not overwrite another feed's category_id: rss rows are shared/global.
      } else {
        const { data: createdFeed, error: feedInsertError } = await supabase
          .from("rss")
          .insert({ name, category: categoryName, category_id: categoryId, rss_url: parsedUrl.href })
          .select("id")
          .single();
        if (feedInsertError) throw feedInsertError;
        rssId = createdFeed.id;
      }

      const { error: selectionError } = await supabase
        .from("user_sources")
        .upsert({ user_id: user.id, rss_id: rssId }, { onConflict: "user_id,rss_id" });
      if (selectionError) throw selectionError;

      setMediaSuccess(`Feed verified and added to “${categoryName}”. ${validation.feedTitle ? `Feed: ${validation.feedTitle}. ` : ""}Run the news pipeline to collect its articles.`);
      setMediaName("");
      setMediaUrl("");
      setMediaCategory("");
      setFeeds((current) => current.some((feed) => feed.id === rssId)
        ? current
        : [...current, { id: rssId, name, category: categoryName, rss_url: parsedUrl.href }]);
    } catch (error) {
      console.error("Unable to add RSS source:", error);
      setMediaError(error.message || "Could not add this RSS source.");
    } finally {
      setMediaBusy(false);
    }
  }

  return (

    <div className="news-dashboard">


<aside
  className={`dashboard-sidebar${mobileNavOpen ? " mobile-open" : ""}`}
  aria-label="Dashboard sidebar"
>
  {/* Brand */}
  <div className="brand-lockup">
    <span className="brand-mark" aria-hidden="true">
      <Sparkles size={21} />
    </span>

    <span className="brand-name">elinity</span>

    <button
      type="button"
      className="icon-button sidebar-close"
      onClick={() => setMobileNavOpen(false)}
      aria-label="Close navigation menu"
    >
      <X size={20} />
    </button>
  </div>

  {/* Main navigation */}
  <nav className="primary-nav" aria-label="Main navigation">
    <SidebarLink
      icon={LayoutDashboard}
      active={categoryView === "feed"}
      onClick={() => {
        setCategoryView("feed");
        setMobileNavOpen(false);
      }}
    >
      Dashboard
    </SidebarLink>
    <SidebarLink
      icon={ImageIcon}
      onClick={() => {
        setShowAddMedia(true);
        setMediaError("");
        setMediaSuccess("");
        setMobileNavOpen(false);
      }}
    >
      Add Media
    </SidebarLink>
  </nav>

  <div className="sidebar-divider" />

  {/* Explore topics */}
  <section className="topic-section" aria-labelledby="topic-nav-heading">
    <div id="topic-nav-heading" className="topic-nav-label">
      Explore topics
    </div>

    <nav className="topic-nav" aria-label="Topic navigation">
      <button
        type="button"
        className={`topic-link topic-feature-link${
          categoryView === "public" ? " active" : ""
        }`}
        aria-current={categoryView === "public" ? "page" : undefined}
        onClick={() => {
          setCategoryView("public");
          setMobileNavOpen(false);
        }}
      >
        <Globe2 size={17} aria-hidden="true" />
        <span>Public Categories</span>
      </button>

      <button
        type="button"
        className={`topic-link topic-feature-link${
          categoryView === "manage" ? " active" : ""
        }`}
        aria-current={categoryView === "manage" ? "page" : undefined}
        onClick={() => {
          setCategoryView("manage");
          setMobileNavOpen(false);
        }}
      >
        <FolderCog size={17} aria-hidden="true" />
        <span>Manage Categories</span>
      </button>

      <div className="topic-nav-subheading">QUICK FILTERS</div>

      <div className="topic-filter-list">
        {TOPICS.map((topic) => {
          const isActive =
            categoryView === "feed" && activeTopic === topic;

          return (
            <button
              key={topic}
              type="button"
              className={`topic-link${isActive ? " active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                setCategoryView("feed");
                pickTopic(topic);
                setMobileNavOpen(false);
              }}
            >
              <span className="topic-link-text">{topic}</span>
            </button>
          );
        })}
      </div>
    </nav>
  </section>

  {/* Bottom navigation */}
  <div className="sidebar-bottom">
    <SidebarLink
      icon={Settings}
      to="/preferences"
      onClick={() => setMobileNavOpen(false)}
    >
      Preferences
    </SidebarLink>

<SidebarLink
  icon={LogOut}
  onClick={() => {
    setMobileNavOpen(false);
    handleLogout();
  }}
>
  Logout
</SidebarLink>
    <div className="user-mini">
      <div className="avatar" aria-hidden="true">
        {(userEmail?.[0] || "R").toUpperCase()}
      </div>

      <div className="user-mini-copy">
        <strong>
          {userEmail === "Reader"
            ? "Your account"
            : userEmail?.split("@")[0] || "Your account"}
        </strong>
        <span>Personal news feed</span>
      </div>
    </div>
  </div>
</aside>


      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="dashboard-main">

        <header className="dashboard-topbar">

          <button className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><Menu size={22} /></button>

          {categoryView === "feed" ? <nav className="feed-tabs" aria-label="News feed views">

            {["Stories for You", "Trending", "Your Topics"].map((tab) => <button key={tab} className={`feed-tab${activeTab === tab ? " active" : ""}`} onClick={() => { setActiveTab(tab); if (tab === "Your Topics") setActiveTopic("All topics"); }}>{tab === "Trending" && <TrendingUp size={15} />}{tab === "Your Topics" && <Zap size={15} />}{tab}</button>)}

          </nav> : <div className="category-topbar-label">{categoryView === "public" ? "Public Categories" : "Manage Categories"}</div>}

        </header>

        {categoryView !== "feed" ? <CategoriesPanel mode={categoryView} onBack={() => setCategoryView("feed")} /> : <div className="dashboard-content">

          <section className="feed-column">

            <div className="mobile-greeting"><span className="eyebrow">YOUR DAILY BRIEFING</span><h1>Stories worth your time.</h1></div>

            {featured ? (

              <article className="featured-story" style={{

                backgroundImage: `linear-gradient(90deg, rgba(7, 15, 25, .88), rgba(7, 15, 25, .1)), linear-gradient(0deg, rgba(7, 15, 25, .6), transparent 70%)${featured.image ? `, url("${featured.image}")` : ""}`

              }}>

                <div className="featured-content"><span className="featured-kicker"><Sparkles size={14} /> FEATURED STORY</span><h1>{featured.title}</h1>

                  <div className="featured-byline"><span className="author-avatar">E</span><span>{featured.author}</span><span>·</span><span>{featured.category}</span></div>

                  <p>{featured.summary}</p><button className="read-featured-button" onClick={() => setSelectedStory(featured)}>Read story <ChevronRight size={16} /></button>

                </div>

                <button className={`featured-save icon-button${savedIds.includes(featured.id) ? " is-saved" : ""}`} onClick={() => toggleSave(featured.id)} aria-label="Bookmark featured story"><Bookmark size={18} fill={savedIds.includes(featured.id) ? "currentColor" : "none"} /></button>

              </article>

            ) : (

              <div className="featured-story featured-empty"><div className="featured-content"><span className="featured-kicker"><Sparkles size={14} /> YOUR DAILY BRIEFING</span>

                <h1>{loadingStories ? "Loading your news..." : "Your next briefing starts here."}</h1>

                <p>{loadingStories ? "Fetching articles and image URLs from Supabase." : "Run the news pipeline or select sources in Preferences to see articles here."}</p>

              </div></div>

            )}

            <div className="section-heading"><div><span className="eyebrow">CURATED FOR YOU</span><h2>{activeTopic === "All topics" ? activeTab : activeTopic}</h2></div><span className="story-count">{stories.length} stories <ChevronRight size={15} /></span></div>

            {activeTab === "Your Topics" && <div className="topic-pills">{["All topics", ...TOPICS].map((topic) => <button key={topic} className={`topic-pill${activeTopic === topic ? " active" : ""}`} onClick={() => setActiveTopic(topic)}>{topic}</button>)}</div>}

            {loadingStories && <div className="empty-state"><p>Loading articles from Supabase...</p></div>}

            <div className="story-grid">{stories.map((story) => <StoryCard key={story.id} story={story} onOpen={setSelectedStory} saved={savedIds.includes(story.id)} onToggleSave={toggleSave} />)}</div>

            {!loadingStories && stories.length === 0 && <div className="empty-state"><Search size={28} /><h3>No articles found</h3><p>{search ? "Try another search or choose a different topic." : "No cached news is available for these sources yet."}</p><button onClick={() => { setSearch(""); setActiveTopic("All topics"); }}>Clear filters</button></div>}

            <p className="data-notice"><Activity size={14} /> {feedMessage}</p>

          </section>

          <aside className="dashboard-rightbar">

            <section className="rightbar-section"><div className="rightbar-heading"><h2>Latest News</h2><button className="text-link" onClick={() => { setActiveTab("Stories for You"); setActiveTopic("All topics"); }}>View all</button></div>

              {stories.slice(0, 4).map((story) => <button className="latest-story" key={story.id} onClick={() => setSelectedStory(story)}>{story.image ? <img src={story.image} alt="" loading="lazy" /> : <span className="latest-image-placeholder"><ImageIcon size={18} /></span>}<span className="latest-copy"><strong>{story.title}</strong><span>{story.category} · {story.time}</span></span></button>)}

            </section>
            <section className="sources-widget"><div className="sources-widget-icon"><Newspaper size={18} /></div><div><strong>Your sources</strong><p>{feeds.length ? `${feeds.length} RSS sources selected` : "Personalize your news feed"}</p></div><NavLink to="/preferences" aria-label="Manage sources"><ChevronRight size={18} /></NavLink></section>

            <div className="rightbar-footer">Made for curious minds <span>·</span> Elinity</div>

          </aside>

        </div>}

      </main>

      {showAddMedia && (

        <div className="reader-backdrop add-media-backdrop" role="presentation" onMouseDown={(event) => {

          if (event.target === event.currentTarget && !mediaBusy) setShowAddMedia(false);

        }}>

          <section className="article-reader add-media-dialog" role="dialog" aria-modal="true" aria-labelledby="add-media-title">

            <button className="reader-close icon-button" type="button" onClick={() => setShowAddMedia(false)} aria-label="Close add media form" disabled={mediaBusy}>

              <X size={21} />

            </button>

            <div className="reader-body">

              <span className="eyebrow">PERSONALIZE YOUR NEWS</span>

              <h2 id="add-media-title">Add an RSS source</h2>

              <p>Enter a feed URL. We'll verify that it returns a readable RSS or Atom feed before saving it.</p>

              <form className="add-media-form" onSubmit={handleAddMedia}>

                <label>

                  Source name

                  <input value={mediaName} onChange={(event) => setMediaName(event.target.value)} placeholder="e.g. The Hindu Technology" required maxLength={100} />

                </label>

                <label>

                  RSS / Atom URL

                  <input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://example.com/rss.xml" required />

                </label>

                <label>

                  Category name

                  <input value={mediaCategory} onChange={(event) => setMediaCategory(event.target.value)} placeholder="e.g. AI Research, Cricket, Local News" required maxLength={60} />

                </label>

                <label>

                  Category visibility

                  <select value={mediaVisibility} onChange={(event) => setMediaVisibility(event.target.value)}>

                    <option value="private">Private — only me</option>

                    <option value="public">Public — other users can discover it</option>

                  </select>

                  <small>Visibility is applied when a new category is created. Existing categories keep their current setting.</small>

                </label>

                {mediaError && <p role="alert" className="add-media-message error">{mediaError}</p>}

                {mediaSuccess && <p role="status" className="add-media-message success">{mediaSuccess}</p>}

                <button className="read-featured-button add-media-submit" type="submit" disabled={mediaBusy}>

                  {mediaBusy ? "Verifying feed..." : "Verify and add source"}

                </button>

              </form>

              <p className="add-media-note">A valid feed must be publicly accessible over HTTPS and contain RSS or Atom entries. Adding it here selects it for your account; your backend pipeline must run to fetch its stories. Public categories can be discovered by other users; private categories are intended for your account only.</p>

            </div>

          </section>

        </div>

      )}

      {selectedStory && <div className="reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedStory(null); }}><section className="article-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title"><button className="reader-close icon-button" onClick={() => setSelectedStory(null)} aria-label="Close article"><X size={21} /></button>{selectedStory.image ? <img className="reader-image" src={selectedStory.image} alt="" /> : null}<div className="reader-body"><span className="eyebrow">{selectedStory.category}</span><h2 id="reader-title">{selectedStory.title}</h2><div className="reader-byline">{selectedStory.author} <span>·</span> {selectedStory.time}</div><p>{selectedStory.summary}</p>{selectedStory.link && <a className="reader-save-button" href={selectedStory.link} target="_blank" rel="noreferrer">Read original article <ChevronRight size={16} /></a>}<button className="reader-save-button" onClick={() => toggleSave(selectedStory.id)}><Bookmark size={16} fill={savedIds.includes(selectedStory.id) ? "currentColor" : "none"} />{savedIds.includes(selectedStory.id) ? "Saved to reading list" : "Save to reading list"}</button></div></section></div>}

    </div>

  );

}