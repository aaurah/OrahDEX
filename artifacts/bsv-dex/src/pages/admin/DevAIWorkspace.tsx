import { adminFetch } from "@/lib/adminFetch";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, Code2, ExternalLink, FileCode2,
  FileText, Folder, GitBranch, LoaderCircle, RefreshCw, Search,
  ShieldCheck, UploadCloud, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = { name: string; path: string; kind: "directory" | "file"; size: number | null };
type GithubEntry = { name: string; path: string; type: "file" | "dir"; size: number | null };
type Proposal = {
  id: string; path: string; description: string; status: string; createdAt: string;
  content?: string; originalContent?: string; githubPrUrl?: string;
};
type Repo = { full_name: string; default_branch: string; private: boolean };
type Branch = { name: string; protected: boolean };
type Tab = "workspace" | "github" | "proposals";

const ROOT = "/api/admin/devai";
const buttonBase = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:pointer-events-none disabled:opacity-45";
const subtleButton = `${buttonBase} border border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.08] hover:text-white`;
const inputClass = "w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminFetch(path, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status})`);
  return result as T;
}

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200">
      <AlertCircle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="rounded-md px-2 py-1 text-xs font-semibold text-rose-100 underline underline-offset-4">Try again</button>}
    </div>
  );
}

function SkeletonRows() {
  return <div aria-label="Loading workspace" className="space-y-2 p-4" role="status">
    {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.045]" />)}
    <span className="sr-only">Loading workspace files</span>
  </div>;
}

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const pieces = path ? path.split("/").filter(Boolean) : [];
  return <nav aria-label="Workspace path" className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs">
    <button type="button" onClick={() => onNavigate("")} className="rounded px-1.5 py-1 text-emerald-300 hover:bg-emerald-300/10">project root</button>
    {pieces.map((piece, index) => {
      const target = pieces.slice(0, index + 1).join("/");
      return <span key={target} className="flex items-center gap-1 text-slate-500">
        <ChevronRight className="h-3 w-3 shrink-0" />
        <button type="button" onClick={() => onNavigate(target)} className="rounded px-1 py-1 text-slate-300 hover:bg-white/5 hover:text-white">{piece}</button>
      </span>;
    })}
  </nav>;
}

export function DevAIWorkspace() {
  const [tab, setTab] = useState<Tab>("workspace");
  const [localPath, setLocalPath] = useState("");
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [localBusy, setLocalBusy] = useState(true);
  const [localError, setLocalError] = useState("");
  const [localFilter, setLocalFilter] = useState("");
  const [searchingAll, setSearchingAll] = useState(false);
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [originalFile, setOriginalFile] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [description, setDescription] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsBusy, setProposalsBusy] = useState(true);
  const [proposalError, setProposalError] = useState("");
  const [proposalBusyId, setProposalBusyId] = useState("");
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [github, setGithub] = useState<{ connected: boolean; login?: string; repos: Repo[] } | null>(null);
  const [githubBusy, setGithubBusy] = useState(true);
  const [githubError, setGithubError] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [githubPath, setGithubPath] = useState("");
  const [githubEntries, setGithubEntries] = useState<GithubEntry[]>([]);
  const [githubTreeBusy, setGithubTreeBusy] = useState(false);
  const [githubTreeError, setGithubTreeError] = useState("");
  const [githubFile, setGithubFile] = useState<{ path: string; content: string } | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [prDialog, setPrDialog] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBusy, setPrBusy] = useState(false);
  const [prError, setPrError] = useState("");
  const [prResult, setPrResult] = useState("");

  const loadLocalTree = useCallback(async (path: string) => {
    setLocalBusy(true); setLocalError("");
    try {
      const data = await requestJson<{ entries: Entry[] }>(`${ROOT}/workspace/tree?path=${encodeURIComponent(path)}`);
      setLocalEntries(data.entries ?? []);
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Unable to load project files."); }
    finally { setLocalBusy(false); }
  }, []);
  const loadProposals = useCallback(async () => {
    setProposalsBusy(true); setProposalError("");
    try {
      const data = await requestJson<{ proposals: Proposal[] }>(`${ROOT}/change-proposals`);
      setProposals(data.proposals ?? []);
    } catch (error) { setProposalError(error instanceof Error ? error.message : "Unable to load proposals."); }
    finally { setProposalsBusy(false); }
  }, []);
  const loadGithub = useCallback(async () => {
    setGithubBusy(true); setGithubError("");
    try {
      const data = await requestJson<{ connected: boolean; login?: string; repos: Repo[] }>(`${ROOT}/github`);
      setGithub(data);
    } catch (error) { setGithubError(error instanceof Error ? error.message : "Unable to load GitHub connection."); }
    finally { setGithubBusy(false); }
  }, []);

  useEffect(() => { void loadLocalTree(""); void loadProposals(); void loadGithub(); }, [loadLocalTree, loadProposals, loadGithub]);
  useEffect(() => { void loadLocalTree(localPath); }, [localPath, loadLocalTree]);
  useEffect(() => {
    if (!prDialog) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !prBusy) setPrDialog(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [prDialog, prBusy]);

  const loadLocalFile = async (path: string) => {
    setSelectedFile(path); setFileBusy(true); setFileError(""); setSaveMessage(""); setDescription("");
    try {
      const data = await requestJson<{ content: string; sha256: string }>(`${ROOT}/workspace/file?path=${encodeURIComponent(path)}`);
      setFileContent(data.content); setOriginalFile(data.content); setFileHash(data.sha256);
    } catch (error) { setFileError(error instanceof Error ? error.message : "Unable to open file."); }
    finally { setFileBusy(false); }
  };

  const searchWorkspace = async () => {
    const term = localFilter.trim().toLowerCase();
    if (!term) { setSearchResults(null); return; }
    setSearchingAll(true); setLocalError(""); setSearchResults([]);
    try {
      const queue = [""];
      const found: Entry[] = [];
      const visited = new Set<string>();
      while (queue.length && visited.size < 250) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const data = await requestJson<{ entries: Entry[] }>(`${ROOT}/workspace/tree?path=${encodeURIComponent(current)}`);
        for (const entry of data.entries ?? []) {
          if (entry.name.toLowerCase().includes(term) || entry.path.toLowerCase().includes(term)) found.push(entry);
          if (entry.kind === "directory") queue.push(entry.path);
        }
        setSearchResults([...found]);
      }
      if (queue.length) setLocalError("Search stopped after 250 folders. Narrow the search term to see more specific results.");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Workspace search failed."); }
    finally { setSearchingAll(false); }
  };

  const openGithubRepo = async (fullName: string) => {
    setRepoName(fullName); setGithubPath(""); setGithubFile(null); setGithubTreeError("");
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) return;
    setGithubTreeBusy(true);
    try {
      const data = await requestJson<{ defaultBranch: string; branches: Branch[] }>(`${ROOT}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`);
      setBranches(data.branches ?? []);
      setBranch(data.defaultBranch || data.branches?.[0]?.name || "");
    } catch (error) { setGithubTreeError(error instanceof Error ? error.message : "Unable to load branches."); }
    finally { setGithubTreeBusy(false); }
  };

  const loadGithubTree = useCallback(async () => {
    if (!repoName || !branch) { setGithubEntries([]); return; }
    const [owner, repo] = repoName.split("/");
    setGithubTreeBusy(true); setGithubTreeError(""); setGithubFile(null);
    try {
      const data = await requestJson<{ entries: GithubEntry[] }>(`${ROOT}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree?ref=${encodeURIComponent(branch)}&path=${encodeURIComponent(githubPath)}`);
      setGithubEntries(data.entries ?? []);
    } catch (error) { setGithubTreeError(error instanceof Error ? error.message : "Unable to load repository files."); }
    finally { setGithubTreeBusy(false); }
  }, [repoName, branch, githubPath]);
  useEffect(() => { void loadGithubTree(); }, [loadGithubTree]);

  const openGithubFile = async (path: string) => {
    const [owner, repo] = repoName.split("/");
    setGithubTreeBusy(true); setGithubTreeError("");
    try {
      const data = await requestJson<{ path: string; content: string }>(`${ROOT}/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/file?ref=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`);
      setGithubFile({ path: data.path, content: data.content });
    } catch (error) { setGithubTreeError(error instanceof Error ? error.message : "Unable to read repository file."); }
    finally { setGithubTreeBusy(false); }
  };

  const submitProposal = async () => {
    if (!selectedFile || !description.trim() || fileContent === originalFile) return;
    setSaveBusy(true); setSaveMessage(""); setFileError("");
    try {
      const result = await requestJson<{ ok: true; proposalId: string }>(`${ROOT}/change-proposals`, jsonPost({ path: selectedFile, content: fileContent, description: description.trim() }));
      setSaveMessage(`Review proposal ${result.proposalId} created. No project files were changed.`);
      setOriginalFile(fileContent); setDescription("");
      await loadProposals();
    } catch (error) { setFileError(error instanceof Error ? error.message : "Unable to create proposal."); }
    finally { setSaveBusy(false); }
  };

  const reviewProposal = async (proposal: Proposal, action: "approve" | "reject") => {
    const verb = action === "approve" ? "apply this change to the local workspace" : "reject this proposal";
    if (!window.confirm(`Confirm: ${verb} for ${proposal.path}? ${action === "approve" ? "This does not publish or push to GitHub." : "The proposal will no longer be pending."}`)) return;
    setProposalBusyId(proposal.id); setProposalError("");
    try {
      await requestJson(`${ROOT}/change-proposals/${encodeURIComponent(proposal.id)}/${action}`, { method: "POST" });
      await loadProposals();
      if (action === "approve" && selectedFile === proposal.path) await loadLocalFile(proposal.path);
    } catch (error) { setProposalError(error instanceof Error ? error.message : "Proposal review failed."); }
    finally { setProposalBusyId(""); }
  };

  const pendingProposals = useMemo(() => proposals.filter(item => item.status === "pending"), [proposals]);
  const filteredEntries = (searchResults ?? localEntries.filter(entry => entry.name.toLowerCase().includes(localFilter.toLowerCase()))).slice().sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1);
  const selectedRepo = github?.repos.find(repo => repo.full_name === repoName);

  const createDraftPr = async () => {
    if (!selectedRepo || !branch || !selectedProposalIds.length || !prTitle.trim()) return;
    const [owner, repo] = selectedRepo.full_name.split("/");
    setPrBusy(true); setPrError(""); setPrResult("");
    try {
      const result = await requestJson<{ url: string; number: number; branch: string }>(`${ROOT}/github/pull-requests`, jsonPost({
        owner_repo: `${owner}/${repo}`, base: branch, proposalIds: selectedProposalIds, title: prTitle.trim(), body: prBody.trim(),
      }));
      setPrResult(result.url);
      setPrDialog(false);
      setSelectedProposalIds([]);
      await loadProposals();
    } catch (error) { setPrError(error instanceof Error ? error.message : "Unable to create draft pull request."); }
    finally { setPrBusy(false); }
  };

  const changed = fileContent !== originalFile;

  return (
    <main className="min-h-[100dvh] bg-[#080d13] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 border-b border-white/[0.08] pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-300"><Code2 className="h-5 w-5" /></div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70"><ShieldCheck className="h-3.5 w-3.5" /> Admin workspace</div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[30px]">DevAI <span className="font-normal text-slate-500">/ Code workspace</span></h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">Browse source, stage review proposals, and keep every change behind an explicit admin decision.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-xs text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Admin access
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Workspace sections">
            {([
              ["workspace", "Project workspace", Folder],
              ["github", "GitHub browser", GitBranch],
              ["proposals", `Review queue${pendingProposals.length ? ` · ${pendingProposals.length}` : ""}`, ShieldCheck],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} role="tab" aria-selected={tab === value} type="button" onClick={() => setTab(value)}
                className={cn("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition", tab === value ? "bg-emerald-300 text-[#07110c]" : "border border-white/[0.08] bg-white/[0.025] text-slate-400 hover:bg-white/[0.06] hover:text-slate-100")}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
            <button type="button" onClick={() => { void loadLocalTree(localPath); void loadProposals(); void loadGithub(); }} className={cn(subtleButton, "ml-auto")} aria-label="Refresh workspace data">
              <RefreshCw className={cn("h-3.5 w-3.5", localBusy && "animate-spin")} /> Refresh
            </button>
          </div>
        </header>

        {tab === "workspace" && <section aria-label="Project workspace" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.65fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c131c]">
            <div className="border-b border-white/[0.07] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div><h2 className="text-sm font-bold text-white">Project files</h2><p className="mt-1 text-[11px] text-slate-500">API-scoped project root only</p></div>
                <Folder className="h-4 w-4 text-emerald-300/70" />
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input aria-label="Search project files" data-testid="input-workspace-search" className={cn(inputClass, "pl-9 pr-10")} placeholder="Search all project paths…" value={localFilter} onChange={event => { setLocalFilter(event.target.value); setSearchResults(null); }} onKeyDown={event => { if (event.key === "Enter") void searchWorkspace(); }} />
                <button type="button" aria-label="Search all project folders" data-testid="button-search-workspace" onClick={() => void searchWorkspace()} disabled={!localFilter.trim() || searchingAll} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
                  {searchingAll ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </div>
              {searchResults && <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>{searchingAll ? "Searching API-scoped folders…" : `${searchResults.length} matching entries`}</span><button type="button" onClick={() => { setSearchResults(null); setLocalFilter(""); }} className="text-emerald-300 hover:text-emerald-200">Clear search</button></div>}
            </div>
            <div className="border-b border-white/[0.06] px-3 py-2.5"><Breadcrumbs path={searchResults ? "" : localPath} onNavigate={path => { setSearchResults(null); setLocalPath(path); }} /></div>
            {localError && <div className="p-3"><ErrorNotice message={localError} onRetry={() => searchResults ? void searchWorkspace() : void loadLocalTree(localPath)} /></div>}
            {localBusy && !searchResults ? <SkeletonRows /> : (
              <div className="max-h-[580px] overflow-y-auto p-2" aria-live="polite">
                {searchResults === null && filteredEntries.map(entry => (
                  <button key={entry.path} type="button" data-testid={`workspace-entry-${entry.path.replace(/[^a-zA-Z0-9_-]/g, "-")}`} onClick={() => entry.kind === "directory" ? setLocalPath(entry.path) : void loadLocalFile(entry.path)}
                    className={cn("group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400", selectedFile === entry.path && "bg-emerald-300/[0.08]")}>
                    {entry.kind === "directory" ? <Folder className="h-4 w-4 shrink-0 text-amber-300/80" /> : <FileCode2 className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-300" />}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{entry.name}</span>
                    {entry.kind === "file" && entry.size != null && <span className="text-[10px] tabular-nums text-slate-600">{entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>}
                    {entry.kind === "directory" && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                  </button>
                ))}
                {searchResults !== null && searchResults.map(entry => <button key={entry.path} type="button" onClick={() => entry.kind === "directory" ? (setSearchResults(null), setLocalPath(entry.path)) : void loadLocalFile(entry.path)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.055]">
                  {entry.kind === "directory" ? <Folder className="h-4 w-4 text-amber-300/80" /> : <FileCode2 className="h-4 w-4 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{entry.path}</span><ArrowRight className="h-3 w-3 text-slate-600" />
                </button>)}
                {!localBusy && !filteredEntries.length && (!searchResults || !searchResults.length) && !localError && <div className="px-4 py-12 text-center">
                  <Folder className="mx-auto mb-3 h-7 w-7 text-slate-600" /><p className="text-sm font-medium text-slate-300">{searchResults ? "No matching paths" : "This folder is empty"}</p><p className="mt-1 text-xs text-slate-500">{searchResults ? "Try a different filename or path." : "Choose another folder from the project tree."}</p>
                </div>}
              </div>
            )}
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c131c]">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.045] text-emerald-300"><FileText className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-white">Source editor</h2><p className="truncate font-mono text-[10px] text-slate-500">{selectedFile || "Select a text file from the project tree"}</p></div>
              {selectedFile && <span className="rounded-md border border-white/[0.08] px-2 py-1 font-mono text-[9px] text-slate-500">{fileContent.split("\n").length} lines</span>}
            </div>
            {fileError && <div className="p-3"><ErrorNotice message={fileError} onRetry={() => selectedFile && void loadLocalFile(selectedFile)} /></div>}
            {fileBusy ? <div className="p-4"><div className="h-[380px] animate-pulse rounded-lg bg-white/[0.04]" /></div> : selectedFile ? <>
              <div className="border-b border-white/[0.06] px-4 py-2 text-[10px] text-slate-500">
                <span className="text-emerald-300/80">SHA-256</span> <code className="ml-2 break-all font-mono">{fileHash || "Unavailable"}</code>
              </div>
              <label className="sr-only" htmlFor="devai-source-editor">Edit file content</label>
              <textarea id="devai-source-editor" data-testid="textarea-source-editor" spellCheck={false} value={fileContent} onChange={event => setFileContent(event.target.value)} className="block min-h-[380px] w-full resize-y bg-[#080e15] px-4 py-4 font-mono text-xs leading-[1.75] text-slate-200 outline-none selection:bg-emerald-300/20 focus:ring-1 focus:ring-inset focus:ring-emerald-400/35" />
              <div className="flex flex-col gap-3 border-t border-white/[0.07] p-4 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="proposal-description" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Proposal summary</label>
                  <input id="proposal-description" data-testid="input-proposal-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="What should reviewers know about this change?" className={inputClass} />
                  {saveMessage && <p role="status" className="mt-2 text-xs text-emerald-300">{saveMessage}</p>}
                </div>
                <button type="button" data-testid="button-create-proposal" onClick={() => void submitProposal()} disabled={!changed || !description.trim() || saveBusy} className={cn(buttonBase, "shrink-0 bg-emerald-300 text-[#06110a] hover:bg-emerald-200")}>
                  {saveBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save as proposal
                </button>
              </div>
              <p className="px-4 pb-4 text-[10px] leading-relaxed text-slate-500">Changes are submitted for review. This editor never writes directly to project files.</p>
            </> : <div className="flex min-h-[470px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.025]"><Code2 className="h-6 w-6 text-slate-500" /></div>
              <h3 className="text-sm font-semibold text-slate-300">Choose a file to begin</h3><p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Browse the API-provided project tree. Edits are staged as proposals, never written directly.</p>
            </div>}
          </div>
        </section>}

        {tab === "github" && <section aria-label="GitHub repository browser" className="grid gap-4 xl:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.8fr)]">
          <div className="rounded-xl border border-white/[0.08] bg-[#0c131c]">
            <div className="flex items-center justify-between border-b border-white/[0.07] p-4"><div><h2 className="text-sm font-bold">Connected GitHub</h2><p className="mt-1 text-[11px] text-slate-500">Read-only repository browser</p></div><GitBranch className="h-4 w-4 text-slate-300" /></div>
            {githubError && <div className="p-3"><ErrorNotice message={githubError} onRetry={() => void loadGithub()} /></div>}
            {githubBusy ? <SkeletonRows /> : github?.connected ? <>
              <div className="m-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2.5 text-xs text-emerald-200"><CheckCircle2 className="mr-2 inline h-3.5 w-3.5" />Connected{github.login ? ` as ${github.login}` : ""}</div>
              <div className="max-h-[500px] overflow-y-auto p-2">
                {github.repos.map(repo => <button key={repo.full_name} type="button" onClick={() => void openGithubRepo(repo.full_name)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left hover:bg-white/[0.055]", repoName === repo.full_name && "bg-white/[0.05]")}>
                  <GitBranch className="h-4 w-4 shrink-0 text-slate-500" /><span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{repo.full_name}</span>
                  {repo.private && <span className="rounded border border-amber-300/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200">Private</span>}
                </button>)}
                {!github.repos.length && <p className="px-4 py-10 text-center text-xs text-slate-500">No repositories are available to this connection.</p>}
              </div>
            </> : <div className="px-5 py-10 text-center"><GitBranch className="mx-auto mb-3 h-7 w-7 text-slate-600" /><p className="text-sm font-semibold text-slate-300">GitHub is not connected</p><p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-500">Ask an administrator to configure the GitHub integration. Credentials are handled by the server and are never shown here.</p></div>}
          </div>
          <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c131c]">
            <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-4">
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{repoName || "Repository files"}</h2><p className="mt-1 text-[11px] text-slate-500">{branch ? `Branch ${branch}` : "Choose a repository to browse"}</p></div>
              {branches.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-500"><GitBranch className="h-3.5 w-3.5" /><span className="sr-only">Branch</span><select aria-label="Select branch" value={branch} onChange={event => { setBranch(event.target.value); setGithubPath(""); }} className="max-w-[180px] rounded-lg border border-white/10 bg-[#0a1018] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400/50">
                {branches.map(item => <option key={item.name} value={item.name}>{item.name}{item.protected ? " · protected" : ""}</option>)}
              </select></label>}
            </div>
            {repoName && <div className="border-b border-white/[0.06] px-4 py-2.5"><Breadcrumbs path={githubPath} onNavigate={setGithubPath} /></div>}
            {githubTreeError && <div className="p-3"><ErrorNotice message={githubTreeError} onRetry={() => repoName && branch && void loadGithubTree()} /></div>}
            {githubTreeBusy ? <SkeletonRows /> : githubFile ? <div className="min-w-0">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5"><button type="button" onClick={() => setGithubFile(null)} className="inline-flex items-center gap-2 text-xs text-emerald-300 hover:text-emerald-200"><ArrowLeft className="h-3.5 w-3.5" />Back to files</button><span className="truncate font-mono text-[10px] text-slate-500">{githubFile.path}</span></div>
              <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words bg-[#080e15] p-4 font-mono text-xs leading-relaxed text-slate-300">{githubFile.content}</pre>
            </div> : <div className="max-h-[620px] overflow-y-auto p-2">
              {githubEntries.map(entry => <button key={entry.path} type="button" onClick={() => entry.type === "dir" ? setGithubPath(entry.path) : void openGithubFile(entry.path)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.055]">
                {entry.type === "dir" ? <Folder className="h-4 w-4 text-amber-300/80" /> : <FileCode2 className="h-4 w-4 text-slate-400" />}
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{entry.name}</span>{entry.type === "dir" && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
              </button>)}
              {repoName && !githubEntries.length && !githubTreeError && <div className="px-5 py-16 text-center text-xs text-slate-500">No files in this repository path.</div>}
              {!repoName && <div className="px-5 py-16 text-center text-xs text-slate-500">Select a repository to browse its branches and files.</div>}
            </div>}
          </div>
        </section>}

        {tab === "proposals" && <section className="space-y-4" aria-label="Change proposal review queue">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0c131c] p-4">
            <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/[0.08] text-amber-200"><ShieldCheck className="h-4 w-4" /></div><div><h2 className="text-sm font-bold">Change proposals</h2><p className="mt-1 text-[11px] text-slate-500">Inspect diffs, then apply locally or reject.</p></div></div>
            <button type="button" onClick={() => void loadProposals()} className={subtleButton}><RefreshCw className={cn("h-3.5 w-3.5", proposalsBusy && "animate-spin")} /> Refresh queue</button>
          </div>
          {proposalError && <ErrorNotice message={proposalError} onRetry={() => void loadProposals()} />}
          {prResult && <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" />Draft PR created. Review and merge it on GitHub, then use Replit’s native Publish action.<a href={prResult} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline underline-offset-4">Open PR <ExternalLink className="h-3 w-3" /></a></div>}
          {githubError && <ErrorNotice message={githubError} onRetry={() => void loadGithub()} />}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">Publish to GitHub</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">Creates a draft pull request only. You must review and merge it on GitHub, then use Replit’s native Publish action.</p></div>
            <select aria-label="Repository for draft pull request" value={repoName} onChange={event => void openGithubRepo(event.target.value)} className="min-w-[180px] max-w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400/50" disabled={!github?.connected}>
              <option value="">Choose repository</option>{github?.repos.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
            </select>
            {branches.length > 0 && <select aria-label="Base branch for draft pull request" value={branch} onChange={event => setBranch(event.target.value)} className="rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400/50">
              {branches.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>}
            <button type="button" onClick={() => { setPrError(""); setPrTitle(`OrahDEX update: ${selectedProposalIds.length} proposal${selectedProposalIds.length === 1 ? "" : "s"}`); setPrDialog(true); }} disabled={!github?.connected || !repoName || !branch || !selectedProposalIds.length} className={cn(buttonBase, "bg-emerald-300 text-[#06110a] hover:bg-emerald-200")}>
              <UploadCloud className="h-3.5 w-3.5" /> Draft PR {selectedProposalIds.length ? `(${selectedProposalIds.length})` : ""}
            </button>
          </div>
          {proposalsBusy ? <div className="rounded-xl border border-white/[0.08] bg-[#0c131c]"><SkeletonRows /></div> : !proposals.length ? <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#0c131c] px-6 py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-300/50" /><h3 className="text-sm font-semibold text-slate-300">Review queue is clear</h3><p className="mt-1 text-xs text-slate-500">New proposals from the workspace will appear here.</p>
          </div> : <div className="space-y-3">
            {proposals.map(proposal => {
              const pending = proposal.status === "pending";
              const expanded = expandedProposal === proposal.id;
              return <article key={proposal.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c131c]">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  {pending && <input aria-label={`Select ${proposal.path} for draft pull request`} type="checkbox" checked={selectedProposalIds.includes(proposal.id)} onChange={event => setSelectedProposalIds(current => event.target.checked ? [...current, proposal.id] : current.filter(id => id !== proposal.id))} className="mt-1 h-4 w-4 accent-emerald-300" />}
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-xs font-semibold text-slate-200">{proposal.path}</p>
                    {proposal.description && <p className="mt-1.5 text-xs text-slate-400">{proposal.description}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-600"><Clock3 className="h-3 w-3" />{Number.isNaN(Date.parse(proposal.createdAt)) ? proposal.createdAt : new Date(proposal.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={cn("rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]", pending ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-200" : proposal.status === "approved" ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-500")}>{proposal.status}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3">
                  <button type="button" onClick={() => setExpandedProposal(expanded ? null : proposal.id)} aria-expanded={expanded} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {expanded ? "Hide diff" : "Inspect change"}</button>
                  {proposal.githubPrUrl && <a href={proposal.githubPrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200">View PR <ExternalLink className="h-3 w-3" /></a>}
                  {pending && <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => void reviewProposal(proposal, "reject")} disabled={proposalBusyId === proposal.id} className={cn(subtleButton, "border-rose-300/15 text-rose-200 hover:bg-rose-300/10")}>{proposalBusyId === proposal.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject</button>
                    <button type="button" onClick={() => void reviewProposal(proposal, "approve")} disabled={proposalBusyId === proposal.id} className={cn(buttonBase, "bg-emerald-300 text-[#06110a] hover:bg-emerald-200")}>{proposalBusyId === proposal.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply locally</button>
                  </div>}
                </div>
                {expanded && <div className="grid border-t border-white/[0.06] lg:grid-cols-2">
                  <div className="min-w-0 border-b border-white/[0.06] lg:border-b-0 lg:border-r"><div className="px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Original</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-[#080e15] p-4 font-mono text-[11px] leading-relaxed text-slate-400">{proposal.originalContent ?? "(new file)"}</pre></div>
                  <div className="min-w-0"><div className="px-4 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300">Proposed</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-[#080e15] p-4 font-mono text-[11px] leading-relaxed text-slate-300">{proposal.content ?? "Proposal content is unavailable."}</pre></div>
                </div>}
              </article>;
            })}
          </div>}
        </section>}
      </div>

      {prDialog && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !prBusy) setPrDialog(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="draft-pr-title" className="w-full max-w-xl rounded-t-2xl border border-white/10 bg-[#0d151f] p-5 shadow-2xl sm:rounded-2xl">
          <div className="mb-4 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-300/[0.08] text-emerald-300"><GitBranch className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 id="draft-pr-title" className="text-base font-bold text-white">Create draft pull request</h2><p className="mt-1 text-xs text-slate-400">{repoName} · base <span className="font-mono text-slate-300">{branch}</span> · {selectedProposalIds.length} pending proposal{selectedProposalIds.length === 1 ? "" : "s"}</p></div><button type="button" aria-label="Close dialog" disabled={prBusy} onClick={() => setPrDialog(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
          <div className="mb-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.055] p-3 text-xs leading-relaxed text-amber-100/90"><strong className="font-semibold">This creates a draft PR only.</strong> It does not merge or publish your changes. Review and merge the PR on GitHub, then use Replit’s native Publish action.</div>
          {prError && <div className="mb-3"><ErrorNotice message={prError} /></div>}
          <div className="space-y-3">
            <div><label htmlFor="pr-title-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Pull request title</label><input id="pr-title-input" autoFocus value={prTitle} onChange={event => setPrTitle(event.target.value)} className={inputClass} /></div>
            <div><label htmlFor="pr-body-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Description</label><textarea id="pr-body-input" value={prBody} onChange={event => setPrBody(event.target.value)} rows={4} placeholder="Add reviewer context…" className={cn(inputClass, "resize-y")} /></div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={prBusy} onClick={() => setPrDialog(false)} className={subtleButton}>Cancel</button>
            <button type="button" disabled={prBusy || !prTitle.trim()} onClick={() => void createDraftPr()} className={cn(buttonBase, "bg-emerald-300 text-[#06110a] hover:bg-emerald-200")}>{prBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} Confirm draft PR</button>
          </div>
        </section>
      </div>}
    </main>
  );
}

export default DevAIWorkspace;
