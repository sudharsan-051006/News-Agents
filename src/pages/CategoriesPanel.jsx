import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, FolderPlus, Globe2, Link2, LockKeyhole, Plus, RefreshCw, Trash2, X, UserPlus, UserMinus } from "lucide-react";
import { supabase } from "../supabaseClient";
import "../styles/CategoriesPanel.css";

function validateRss(url) {
  const endpoint = import.meta.env.VITE_RSS_VALIDATOR_URL;
  if (!endpoint) return Promise.reject(new Error("Missing VITE_RSS_VALIDATOR_URL in your .env file."));
  return new Promise((resolve, reject) => {
    const callbackName = `rssValidation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("RSS validation timed out.")), 20000);
    function cleanup() { window.clearTimeout(timeout); script.remove(); try { delete window[callbackName]; } catch { window[callbackName] = undefined; } }
    function finish(error, result) { cleanup(); error ? reject(error) : resolve(result); }
    window[callbackName] = result => finish(null, result);
    script.onerror = () => finish(new Error("Could not reach the RSS validator. Check your Apps Script /exec URL."));
    script.src = `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  });
}

export default function CategoriesPanel({ mode = "manage", onBack, onCategorySelect }) {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [publicCategories, setPublicCategories] = useState([]);
  const [sources, setSources] = useState({});
  const [followedCategoryIds, setFollowedCategoryIds] = useState(new Set());
  const [followBusyId, setFollowBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [expandedCategory, setExpandedCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth?.user) throw new Error("Please sign in to manage categories.");
      setUser(auth.user);
      const [{ data: own, error: ownError }, { data: pub, error: pubError }] = await Promise.all([
        supabase.from("categories").select("id,owner_id,name,description,visibility,created_at").eq("owner_id", auth.user.id).order("name"),
        supabase.from("categories").select("id,owner_id,name,description,visibility,created_at").eq("visibility", "public").order("name").limit(100),
      ]);
      if (ownError) throw ownError;
      if (pubError) throw pubError;
      const owned = own || [];
      setCategories(owned);
      setPublicCategories((pub || []).filter(c => c.owner_id !== auth.user.id));
      const { data: follows, error: followsError } = await supabase
        .from("category_follows")
        .select("category_id")
        .eq("user_id", auth.user.id);
      if (followsError) throw followsError;
      setFollowedCategoryIds(new Set((follows || []).map(row => row.category_id)));
      if (!selectedCategory && owned[0]) setSelectedCategory(owned[0].id);
      const ids = [...new Set([...owned, ...(pub || [])].map(c => c.id))];
      if (ids.length) {
        // Load the new many-to-many mappings.
        const { data: links, error: linksError } = await supabase
          .from("category_sources")
          .select("category_id,rss_id,rss(id,name,rss_url,category)")
          .in("category_id", ids);
        if (linksError) throw linksError;

        // Backward compatibility: older RSS records may still be assigned through
        // rss.category_id and have not yet been copied into category_sources.
        const { data: legacyFeeds, error: legacyError } = await supabase
          .from("rss")
          .select("id,name,rss_url,category,category_id")
          .in("category_id", ids);
        if (legacyError) throw legacyError;

        const grouped = {};
        const seen = new Set();
        (links || []).forEach(link => {
          if (!link.rss) return;
          const feed = { ...link.rss, rss_id: link.rss_id };
          (grouped[link.category_id] ||= []).push(feed);
          seen.add(`${link.category_id}:${link.rss_id}`);
        });
        (legacyFeeds || []).forEach(feed => {
          const key = `${feed.category_id}:${feed.id}`;
          if (seen.has(key)) return;
          (grouped[feed.category_id] ||= []).push({ ...feed, rss_id: feed.id });
          seen.add(key);
        });
        Object.values(grouped).forEach(list => list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        setSources(grouped);
      } else setSources({});
    } catch (e) { setError(e.message || "Could not load categories."); }
    finally { setLoading(false); }
  }, [selectedCategory]);

  useEffect(() => { load(); }, [load]);

  async function createCategory(event) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!name.trim()) { setError("Enter a category name."); return; }
    setBusy(true);
    try {
      const { data, error: insertError } = await supabase.from("categories").insert({ owner_id: user.id, name: name.trim(), description: description.trim() || null, visibility }).select("id,owner_id,name,description,visibility,created_at").single();
      if (insertError) throw insertError;
      setCategories(current => [...current, data].sort((a,b) => a.name.localeCompare(b.name)));
      setSelectedCategory(data.id); setName(""); setDescription(""); setVisibility("private");
      setSuccess(`Created “${data.name}”. You can now add RSS links below.`);
    } catch (e) { setError(e.message || "Could not create category."); }
    finally { setBusy(false); }
  }

  async function addSource(event) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!selectedCategory) { setError("Create a category first, then select it here."); return; }
    let url;
    try { url = new URL(sourceUrl.trim()); } catch { setError("Enter a valid RSS URL."); return; }
    if (url.protocol !== "https:") { setError("Use an HTTPS RSS URL."); return; }
    setBusy(true);
    try {
      const validation = await validateRss(url.href);
      if (!validation?.valid) throw new Error(validation?.message || "This URL is not a valid RSS or Atom feed.");
      let { data: rss, error: rssLookupError } = await supabase.from("rss").select("id,name,rss_url,category").eq("rss_url", url.href).maybeSingle();
      if (rssLookupError) throw rssLookupError;
      if (!rss) {
        const cat = categories.find(c => c.id === selectedCategory);
        const { data: created, error: rssInsertError } = await supabase.from("rss").insert({ name: sourceName.trim() || validation.feedTitle || url.hostname, category: cat?.name || "General", category_id: selectedCategory, rss_url: url.href }).select("id,name,rss_url,category").single();
        if (rssInsertError) throw rssInsertError;
        rss = created;
      }
      const { data: existingLink, error: linkLookupError } = await supabase.from("category_sources").select("category_id").eq("category_id", selectedCategory).eq("rss_id", rss.id).maybeSingle();
      if (linkLookupError) throw linkLookupError;
      if (!existingLink) {
        const { error: linkInsertError } = await supabase.from("category_sources").insert({ category_id: selectedCategory, rss_id: rss.id });
        if (linkInsertError) throw linkInsertError;
      }
      // Also select this source for the current user's personalized dashboard feed.
      const { data: selectedSource, error: selectedLookupError } = await supabase
        .from("user_sources").select("rss_id").eq("user_id", user.id).eq("rss_id", rss.id).maybeSingle();
      if (selectedLookupError) throw selectedLookupError;
      if (!selectedSource) {
        const { error: selectedInsertError } = await supabase.from("user_sources").insert({ user_id: user.id, rss_id: rss.id });
        if (selectedInsertError) throw selectedInsertError;
      }
      setSources(current => ({ ...current, [selectedCategory]: [...(current[selectedCategory] || []).filter(s => s.id !== rss.id), rss] }));
      setSourceName(""); setSourceUrl(""); setSuccess(`Added ${rss.name} to the selected category.`);
    } catch (e) { setError(e.message || "Could not add this RSS link."); }
    finally { setBusy(false); }
  }

  async function toggleFollow(category) {
    if (!user) { setError("Please sign in to follow categories."); return; }
    setError(""); setSuccess(""); setFollowBusyId(category.id);
    const isFollowing = followedCategoryIds.has(category.id);
    try {
      if (isFollowing) {
        const { error: deleteError } = await supabase.from("category_follows").delete().eq("category_id", category.id).eq("user_id", user.id);
        if (deleteError) throw deleteError;
        setFollowedCategoryIds(current => { const next = new Set(current); next.delete(category.id); return next; });
        setSuccess(`Unfollowed “${category.name}”.`);
      } else {
        const { error: insertError } = await supabase.from("category_follows").insert({ category_id: category.id, user_id: user.id });
        if (insertError) throw insertError;
        setFollowedCategoryIds(current => new Set([...current, category.id]));
        setSuccess(`Following “${category.name}”.`);
      }
    } catch (e) { setError(e.message || "Could not update category follow status."); }
    finally { setFollowBusyId(""); }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete your category “${category.name}”? This will not delete the RSS feed records.`)) return;
    setError(""); setSuccess("");
    const { error: deleteError } = await supabase.from("categories").delete().eq("id", category.id).eq("owner_id", user.id);
    if (deleteError) { setError(deleteError.message); return; }
    setCategories(current => current.filter(c => c.id !== category.id));
    setSources(current => { const next = { ...current }; delete next[category.id]; return next; });
    if (selectedCategory === category.id) setSelectedCategory(categories.find(c => c.id !== category.id)?.id || "");
    setSuccess(`Deleted “${category.name}”.`);
  }

  async function removeSource(categoryId, rssId) {
    setError("");
    const { error: deleteError } = await supabase.from("category_sources").delete().eq("category_id", categoryId).eq("rss_id", rssId);
    if (deleteError) { setError(deleteError.message); return; }
    setSources(current => ({ ...current, [categoryId]: (current[categoryId] || []).filter(s => s.id !== rssId) }));
    setSuccess("RSS link removed from this category.");
  }

  return <section className="categories-panel">
    <header className="categories-panel-header">
      <div className="categories-heading-icon"><FolderPlus size={22}/></div>
      <div className="categories-heading-copy"><span className="eyebrow">EXPLORE TOPICS</span><h1>{mode === "public" ? "Public Categories" : "Manage Categories"}</h1><p>{mode === "public" ? "Discover public collections made by other readers. These categories are view-only." : "Create your own categories and organize RSS links. Public categories from other readers are suggested below, but only their owners can edit them."}</p></div>
      <button type="button" className="categories-refresh" onClick={load} title="Refresh categories"><RefreshCw size={17}/></button>
      {onBack && <button type="button" className="categories-back" onClick={onBack}><ArrowLeft size={16}/> Back to news</button>}
    </header>
    {error && <p className="categories-alert error">{error}</p>}{success && <p className="categories-alert success"><Check size={15}/>{success}</p>}
    {loading ? <div className="categories-loading">Loading categories…</div> : <>
      {mode === "manage" && <div className="categories-workspace">
        <form className="category-create-card" onSubmit={createCategory}>
          <span className="category-card-kicker"><Plus size={15}/> NEW COLLECTION</span><h2>Create a category</h2><p>Give related news sources a home.</p>
          <label>Category name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AI Research" maxLength={80} required/></label>
          <label>Description <span className="optional-label">Optional</span><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this category about?" rows={3} maxLength={300}/></label>
          <label>Visibility<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">Private — only me</option><option value="public">Public — discoverable by others</option></select></label>
          <button className="category-primary-button" disabled={busy}><Plus size={16}/>{busy ? "Creating…" : "Create category"}</button>
        </form>
        <div className="category-manage-card"><div className="category-card-title"><div><span className="category-card-kicker">YOUR LIBRARY</span><h2>Your categories <span className="category-count-badge">{categories.length}</span></h2></div></div>
          {!categories.length ? <div className="category-empty"><FolderPlus size={25}/><strong>No categories yet</strong><span>Create your first category to start organizing RSS feeds.</span></div> : <div className="owned-category-list">{categories.map(cat => <article className={`owned-category${selectedCategory === cat.id ? " selected" : ""}`} key={cat.id}>
            <button type="button" className="owned-category-main" onClick={() => { setSelectedCategory(cat.id); setExpandedCategory(expandedCategory === cat.id ? "" : cat.id); }}><span className="category-folder-icon"><FolderPlus size={18}/></span><span className="owned-category-copy"><strong>{cat.name}</strong><small>{(sources[cat.id] || []).length} RSS links · {cat.description || "No description"}</small></span><span className={`visibility-chip ${cat.visibility === "public" ? "public" : "private"}`}>{cat.visibility === "public" ? <Globe2 size={12}/> : <LockKeyhole size={12}/>} {cat.visibility}</span></button>
            {expandedCategory === cat.id && <div className="owned-category-expanded"><p>{cat.description || "No description provided."}</p><div className="category-source-list">{(sources[cat.id] || []).map(source => <div className="category-source-row" key={source.id}><Link2 size={14}/><span><strong>{source.name}</strong><small>{source.rss_url}</small></span><button type="button" title="Remove from category" onClick={() => removeSource(cat.id, source.id)}><X size={15}/></button></div>)}{!(sources[cat.id] || []).length && <small className="muted-note">No RSS links added yet.</small>}</div><button type="button" className="category-delete-button" onClick={() => deleteCategory(cat)}><Trash2 size={14}/> Delete category</button></div>}
          </article>)}</div>}
        </div>
        <form className="category-add-source-card" onSubmit={addSource}><span className="category-card-kicker"><Link2 size={15}/> ADD RSS LINK</span><h2>Add a link to a category</h2><p>Feeds are verified before they are saved. Existing feeds can be linked without changing their original category.</p>
          <label>Choose your category<select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} required><option value="">Select a category</option>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name} ({cat.visibility})</option>)}</select></label>
          <label>Source name <span className="optional-label">Optional</span><input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="e.g. OpenAI News" maxLength={100}/></label>
          <label>RSS / Atom URL<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://example.com/feed.xml" required/></label>
          <button className="category-primary-button" disabled={busy || !categories.length}><Link2 size={16}/>{busy ? "Verifying and adding…" : "Verify and add link"}</button>
        </form>
      </div>}
      <section className="public-category-section"><div className="public-category-heading"><div><span className="category-card-kicker"><Globe2 size={15}/> COMMUNITY COLLECTIONS</span><h2>{mode === "public" ? "Explore public categories" : "Suggested public categories"}</h2><p>Public categories created by other users. Follow them to save the collection; only its owner can edit or delete it.</p></div><span className="category-count-badge">{publicCategories.length}</span></div>
        {!publicCategories.length ? <div className="category-empty compact"><Globe2 size={22}/><strong>No public categories to suggest yet</strong><span>When other readers publish categories, they will appear here.</span></div> : <div className="public-category-grid">{publicCategories.map(cat => <article className="public-category-card" key={cat.id}><div className="public-category-card-top"><span className="public-category-icon"><Globe2 size={18}/></span><span className="visibility-chip public"><Globe2 size={12}/> public</span></div><h3>{cat.name}</h3><p>{cat.description || "A public collection shared by another reader."}</p><div className="public-category-card-footer"><span><LockKeyhole size={13}/> Owner-editable only</span><div className="public-category-actions"><button type="button" className="category-follow-button" disabled={followBusyId === cat.id} onClick={() => toggleFollow(cat)}>{followedCategoryIds.has(cat.id) ? <><UserMinus size={14}/>{followBusyId === cat.id ? "Updating…" : "Unfollow"}</> : <><UserPlus size={14}/>{followBusyId === cat.id ? "Updating…" : "Follow"}</>}</button>{onCategorySelect && <button type="button" onClick={() => onCategorySelect(cat)}>Explore <ExternalLink size={13}/></button>}</div></div></article>)}</div>}
      </section>
    </>}
  </section>;
}
