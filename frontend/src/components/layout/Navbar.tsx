import type { FormEvent } from "react";
import {
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  ChevronDown,
  Home,
  LogOut,
  MessageSquare,
  Search,
  TrendingUp,
  Trash2,
  User,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout as logoutRequest } from "../../api/auth";
import { listPendingConnections } from "../../api/connections";
import { getMember, searchMembers } from "../../api/members";
import { getThreadsByUser } from "../../api/messages";
import { searchJobs } from "../../api/jobs";
import { getRecruiter, searchRecruiters } from "../../api/recruiters";
import { authStore } from "../../context/AuthContext";
import { useDebounce } from "../../hooks/useDebounce";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";
import { getHomePath, getJobsNavPath } from "../../utils/navigation";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { LeadingIconInput } from "../ui/LeadingIconInput";
import { DeleteAccountDialogs } from "./DeleteAccountDialogs";
import { LinkedInWordmark } from "./LinkedInWordmark";

type SearchSuggestion =
  | {
      id: string;
      to: string;
      type: "member" | "recruiter";
      name: string;
      headline: string;
      avatarUrl?: string | null;
    }
  | {
      id: string;
      to: string;
      type: "job";
      title: string;
      company: string;
    }
  | { id: "view-all"; to: string; type: "view-all" };

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = authStore((state) => state.userId);
  const role = authStore((state) => state.role);
  const clearAuth = authStore((state) => state.logout);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [networkCount, setNetworkCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [seenNetworkCount, setSeenNetworkCount] = useState(0);
  const [seenMessageCount, setSeenMessageCount] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 220);
  const homePath = getHomePath(role);
  /** Recruiters use `?type=recruiter` so `ProfilePage` always loads `/recruiters/get` (same id as auth `user_id`). */
  const profileMeHref = userId
    ? role === "recruiter"
      ? `/profile/${userId}?type=recruiter`
      : `/profile/${userId}`
    : "/feed";

  const jobsNavPath = getJobsNavPath(role);

  const navItems = useMemo(
    () =>
      role === "recruiter"
        ? [
            { to: "/feed", label: "Home", icon: Home },
            { to: "/connections", label: "My Network", icon: Users },
            { to: jobsNavPath, label: "Jobs", icon: BriefcaseBusiness },
            { to: "/messages", label: "Messaging", icon: MessageSquare },
            { to: "/dashboard", label: "Analytics", icon: BarChart3 }
          ]
        : [
            { to: "/feed", label: "Home", icon: Home },
            { to: jobsNavPath, label: "Jobs", icon: BriefcaseBusiness },
            { to: "/connections", label: "My Network", icon: Users },
            { to: "/messages", label: "Messaging", icon: MessageSquare },
            { to: "/dashboard", label: "Analytics", icon: BarChart3 }
          ],
    [role, jobsNavPath]
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    setSuggestionsOpen(false);
    navigate(keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/search");
  }

  function handleSuggestionSelect(item: SearchSuggestion) {
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    navigate(item.to);
  }

  async function handleLogout() {
    try {
      await logoutRequest();
    } catch {
      // The local session should still be cleared even if the API call fails.
    }
    clearAuth();
    setMenuOpen(false);
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen && !suggestionsOpen) return undefined;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
      if (suggestionsOpen && !searchRef.current?.contains(target)) {
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen, suggestionsOpen]);

  useEffect(() => {
    const keyword = debouncedQuery.trim();
    if (keyword.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    let cancelled = false;
    void Promise.allSettled([
      searchMembers({ keyword, page: 1 }),
      searchRecruiters({ name: keyword, page: 1 }),
      searchJobs({ keyword, page: 1 })
    ]).then((results) => {
      if (cancelled) return;
      const memberItems =
        results[0].status === "fulfilled"
          ? results[0].value.members.slice(0, 8).map((member) => {
              const name = `${member.first_name} ${member.last_name}`.trim();
              return {
                id: `member-${member.member_id}`,
                name,
                headline: member.headline?.trim() || "Member",
                avatarUrl: member.profile_photo_url ?? null,
                to: `/profile/${member.member_id}`,
                type: "member" as const
              };
            })
          : [];
      const recruiterItems =
        results[1].status === "fulfilled"
          ? results[1].value.recruiters.slice(0, 4).map((recruiter) => {
              const subtitle = [recruiter.role, recruiter.company_name].filter(Boolean).join(" · ");
              return {
                id: `recruiter-${recruiter.recruiter_id}`,
                name: recruiter.name || "Recruiter",
                headline: recruiter.headline?.trim() || subtitle || "Recruiter",
                avatarUrl: recruiter.profile_photo_url ?? null,
                to: `/recruiters/${recruiter.recruiter_id}`,
                type: "recruiter" as const
              };
            })
          : [];
      const jobItems =
        results[2].status === "fulfilled"
          ? results[2].value.jobs.slice(0, 3).map((job) => ({
              id: `job-${job.job_id}`,
              title: job.title,
              company: job.company_name || "Company",
              to: `/jobs/${job.job_id}`,
              type: "job" as const
            }))
          : [];

      const items: SearchSuggestion[] = [
        ...memberItems,
        ...recruiterItems,
        ...jobItems,
        {
          id: "view-all",
          to: `/search?q=${encodeURIComponent(keyword)}`,
          type: "view-all" as const
        }
      ];
      setSuggestions(items);
      setSuggestionsOpen(items.length > 0);
      setActiveSuggestionIndex(-1);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!userId || !role) return;
    void (async () => {
      try {
        if (role === "member") {
          const member = await getMember(userId);
          setAvatarUrl(member.profile_photo_url ?? undefined);
          return;
        }
        if (role === "recruiter") {
          const recruiter = await getRecruiter(userId);
          setAvatarUrl(recruiter.profile_photo_url ?? undefined);
        }
      } catch {
        setAvatarUrl(undefined);
      }
    })();
  }, [role, userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const pending = await listPendingConnections(userId);
        const incoming = pending.filter((request) => (request.direction ?? "incoming") === "incoming");
        setNetworkCount(incoming.length);
      } catch {
        setNetworkCount(0);
      }
    })();
  }, [userId, location.pathname]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const threads = await getThreadsByUser(userId, 1);
        setMessageCount(threads.total ?? threads.threads.length ?? 0);
      } catch {
        setMessageCount(0);
      }
    })();
  }, [userId, location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/connections")) {
      setSeenNetworkCount(networkCount);
    }
    if (location.pathname.startsWith("/messages")) {
      setSeenMessageCount(messageCount);
    }
  }, [location.pathname, networkCount, messageCount]);

  const navItemsWithBadges = navItems.map((item) => {
    if (item.to === "/connections") {
      return { ...item, badge: Math.max(0, networkCount - seenNetworkCount) };
    }
    if (item.to === "/messages") {
      return { ...item, badge: Math.max(0, messageCount - seenMessageCount) };
    }
    return { ...item, badge: 0 };
  });

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-white shadow-navbar">
        <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "flex h-[52px] items-center gap-3 py-0")}>
          <div className="flex min-w-0 items-center gap-3">
            <LinkedInWordmark to={homePath} compact />
            <form className="relative hidden md:block" autoComplete="off" onSubmit={handleSearch} ref={searchRef}>
              <LeadingIconInput
                Icon={Search}
                iconStrokeWidth={2.5}
                iconClassName="text-[#1f1f1f]"
                autoComplete="off"
                className="w-[min(34vw,540px)] min-w-[260px] !pr-6"
                aria-label="Search people, jobs, posts, and more"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  if (suggestions.length) setSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (!suggestionsOpen || suggestions.length === 0) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveSuggestionIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
                  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
                    event.preventDefault();
                    handleSuggestionSelect(suggestions[activeSuggestionIndex]);
                  } else if (event.key === "Escape") {
                    setSuggestionsOpen(false);
                    setActiveSuggestionIndex(-1);
                  }
                }}
              />
              {suggestionsOpen ? (
                <div className="absolute left-0 right-0 top-[52px] z-50 max-h-[420px] overflow-y-auto rounded-b-xl rounded-t-sm border border-[#e0e0e0] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                  {suggestions.map((item, index) => {
                    const isActive = index === activeSuggestionIndex;
                    if (item.type === "view-all") {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "w-full border-t border-[#eef0f2] px-4 py-3 text-center text-sm font-semibold text-[#0a66c2] hover:bg-[#f3f2ef]",
                            isActive && "bg-[#eef3f8]"
                          )}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSuggestionSelect(item)}
                        >
                          See all results
                        </button>
                      );
                    }
                    if (item.type === "job") {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                            isActive ? "bg-[#eef3f8]" : "bg-white hover:bg-[#f3f2ef]"
                          )}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSuggestionSelect(item)}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#e8f3ff] text-[#0a66c2]">
                            <BriefcaseBusiness className="h-4 w-4" />
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[#000]">{item.title}</span>
                            <span className="block truncate text-xs text-[#666]">{item.company}</span>
                          </span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                          isActive ? "bg-[#eef3f8]" : "bg-white hover:bg-[#f3f2ef]"
                        )}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSuggestionSelect(item)}
                      >
                        <Avatar src={item.avatarUrl} alt={item.name} name={item.name} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#000]">{item.name}</span>
                          <span className="block truncate text-xs text-[#666]">{item.headline}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </form>
          </div>
          <div className="ml-auto hidden items-stretch gap-1 md:flex">
            {navItemsWithBadges.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-w-[84px] flex-col items-center justify-center border-b-2 px-2 text-xs ${
                    isActive ? "border-brand text-brand" : "border-transparent text-text-secondary"
                  }`
                }
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  <NotificationBadge count={badge} />
                </div>
                <span>{label}</span>
              </NavLink>
            ))}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                className={`flex min-w-[88px] flex-col items-center justify-center border-b-2 px-2 text-xs ${
                  menuOpen ? "border-brand text-brand" : "border-transparent text-premium"
                }`}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <Avatar src={avatarUrl} alt="Profile" name={role ?? "User"} size="sm" />
                <span className="flex items-center gap-1">
                  Me
                  <ChevronDown className="h-3.5 w-3.5" />
                </span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-64 rounded-card border bg-white p-2 shadow-modal">
                  <Link
                    to={profileMeHref}
                    className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                    onClick={() => setMenuOpen(false)}
                  >
                    <User className="h-4 w-4 text-brand" />
                    View profile
                  </Link>
                  {role === "member" ? (
                    <>
                      <Link
                        to="/applications"
                        className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                        onClick={() => setMenuOpen(false)}
                      >
                        <BriefcaseBusiness className="h-4 w-4 text-brand" />
                        My applications
                      </Link>
                      <Link
                        to="/saved-jobs"
                        className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Bookmark className="h-4 w-4 text-brand" />
                        Saved jobs
                      </Link>
                    </>
                  ) : (
                    <Link
                      to="/recruiter/analytics/profile"
                      className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                      onClick={() => setMenuOpen(false)}
                    >
                      <TrendingUp className="h-4 w-4 text-brand" />
                      Insights
                    </Link>
                  )}
                  <div className="my-2 border-t border-[#e5e7eb]" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm font-semibold hover:bg-[#fef2f2]"
                    style={{ color: "#B91C1C" }}
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteConfirmOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" style={{ color: "#B91C1C" }} />
                    Delete account
                  </button>
                  <div className="my-2 border-t border-[#e5e7eb]" />
                  <Button fullWidth variant="ghost" className="justify-start px-3 py-2 text-sm font-semibold" onClick={() => void handleLogout()}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </nav>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-12 items-center justify-around border-t bg-white md:hidden">
        {navItemsWithBadges.map(({ to, icon: Icon, label, badge }) => (
          <NavLink key={to} to={to} className="flex items-center justify-center text-text-secondary" aria-label={label}>
            <div className="relative">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              <NotificationBadge count={badge} />
            </div>
          </NavLink>
        ))}
      </div>
      <div className="hidden">{userId}</div>

      <DeleteAccountDialogs
        confirmOpen={deleteConfirmOpen}
        onCloseConfirm={() => setDeleteConfirmOpen(false)}
        onNavigateAfterSuccess={() => {
          clearAuth();
          navigate("/login", { replace: true });
        }}
      />
    </>
  );
}

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#d11124] px-1 text-[10px] font-semibold leading-none text-white">
      {text}
    </span>
  );
}
