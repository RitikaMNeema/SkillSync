import type { FormEvent } from "react";
import { BarChart3, Bookmark, BriefcaseBusiness, ChevronDown, Home, LogOut, MessageSquare, Search, User, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout as logoutRequest } from "../../api/auth";
import { authStore } from "../../context/AuthContext";
import { getHomePath, getProfilePath } from "../../utils/navigation";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { LinkedInWordmark } from "./LinkedInWordmark";

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = authStore((state) => state.userId);
  const role = authStore((state) => state.role);
  const clearAuth = authStore((state) => state.logout);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const homePath = getHomePath(role);
  const profilePath = getProfilePath(role, userId);

  const navItems = useMemo(
    () =>
      role === "recruiter"
        ? [
            { to: "/recruiter/dashboard", label: "Home", icon: Home },
            { to: "/recruiter/jobs", label: "Jobs", icon: BriefcaseBusiness },
            { to: "/connections", label: "Network", icon: Users },
            { to: "/messages", label: "Messaging", icon: MessageSquare }
          ]
        : [
            { to: "/feed", label: "Home", icon: Home },
            { to: "/connections", label: "My Network", icon: Users },
            { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
            { to: "/messages", label: "Messaging", icon: MessageSquare },
            { to: "/dashboard", label: "Analytics", icon: BarChart3 }
          ],
    [role]
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role === "recruiter") {
      navigate("/recruiter/jobs");
      return;
    }
    const keyword = query.trim();
    navigate(keyword ? `/jobs?keyword=${encodeURIComponent(keyword)}` : "/jobs");
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
    if (!menuOpen) return undefined;

    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-white shadow-navbar">
        <div className="mx-auto flex h-[52px] max-w-[1128px] items-center gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <LinkedInWordmark to={homePath} compact />
            <form className="relative hidden md:block" onSubmit={handleSearch}>
              <Search className="pointer-events-none absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-[#1f1f1f]" strokeWidth={2.5} />
              <Input
                className="h-[46px] w-[min(34vw,540px)] min-w-[260px] rounded-full border-[2px] border-[#b0b4b8] bg-white !pl-11 pr-6 text-[17px] placeholder:text-[#666666] focus:border-[#666666] focus:shadow-none"
                placeholder="I'm looking for..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
          </div>
          <div className="ml-auto hidden items-stretch gap-1 md:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-w-[80px] flex-col items-center justify-center border-b-2 px-2 text-xs ${
                    isActive ? "border-brand text-brand" : "border-transparent text-text-secondary"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
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
                <Avatar alt="Profile" name={role ?? "User"} size="sm" />
                <span className="flex items-center gap-1">
                  Me
                  <ChevronDown className="h-3.5 w-3.5" />
                </span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-3 w-60 rounded-card border bg-white p-2 shadow-modal">
                  <Link
                    to={profilePath}
                    className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                  >
                    <User className="h-4 w-4 text-brand" />
                    {role === "recruiter" ? "Open dashboard" : "View profile"}
                  </Link>
                  {role === "member" ? (
                    <>
                      <Link
                        to="/applications"
                        className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                      >
                        <BriefcaseBusiness className="h-4 w-4 text-brand" />
                        My applications
                      </Link>
                      <Link
                        to="/saved-jobs"
                        className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                      >
                        <Bookmark className="h-4 w-4 text-brand" />
                        Saved jobs
                      </Link>
                    </>
                  ) : (
                    <Link
                      to="/recruiter/jobs"
                      className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover hover:no-underline"
                    >
                      <BriefcaseBusiness className="h-4 w-4 text-brand" />
                      Manage jobs
                    </Link>
                  )}
                  <div className="my-2 border-t" />
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
      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-10 items-center justify-around border-t bg-white md:hidden">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className="flex items-center justify-center text-text-secondary" aria-label={label}>
            <Icon className="h-5 w-5" />
          </NavLink>
        ))}
      </div>
      <div className="hidden">{userId}</div>
    </>
  );
}
