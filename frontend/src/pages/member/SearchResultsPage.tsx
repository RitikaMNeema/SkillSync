import { BriefcaseBusiness, Search, Users, UsersRound } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listConnections, listPendingConnections } from "../../api/connections";
import { searchMembers } from "../../api/members";
import { searchJobs } from "../../api/jobs";
import { searchRecruiters } from "../../api/recruiters";
import {
  FilterSidebar,
  type SearchFiltersState,
  JobResultCard,
  PersonResultCard,
  SearchResultsLayout,
  SuggestedPeopleCard,
  type SuggestedPerson,
} from "../../components/search";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useDebounce } from "../../hooks/useDebounce";
import type { MemberSearchItem } from "../../types/member";
import type { Job } from "../../types/job";
import type { RecruiterProfile } from "../../types/recruiter";

type SearchScope = "all" | "people" | "jobs";

const SEARCH_SCOPES: Array<{ id: SearchScope; label: string; icon?: React.ElementType }> = [
  { id: "all", label: "All" },
  { id: "people", label: "People", icon: UsersRound },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
];

const EMPTY_FILTERS: SearchFiltersState = {
  location: "",
  currentCompany: "",
  pastCompany: "",
  school: "",
};

function textMatches(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return haystack.toLowerCase().includes(n);
}

function memberMatchesFilters(m: MemberSearchItem, f: SearchFiltersState): boolean {
  const loc = [m.location_city, m.location_state, m.location_country].filter(Boolean).join(" ");
  const headline = m.headline ?? "";
  const skills = (m.skills ?? []).join(" ");
  if (!textMatches(`${loc} ${headline}`, f.location)) return false;
  if (!textMatches(`${headline} ${skills}`, f.currentCompany)) return false;
  if (!textMatches(headline, f.pastCompany)) return false;
  if (!textMatches(`${headline} ${skills}`, f.school)) return false;
  return true;
}

function recruiterMatchesFilters(r: RecruiterProfile, f: SearchFiltersState): boolean {
  const loc = [r.location_city, r.location_state, r.location_country, r.company_location].filter(Boolean).join(" ");
  const headline = r.headline ?? "";
  const company = r.company_name ?? "";
  const role = r.role ?? "";
  if (!textMatches(`${loc} ${headline} ${company}`, f.location)) return false;
  if (!textMatches(`${company} ${headline} ${role}`, f.currentCompany)) return false;
  if (!textMatches(headline, f.pastCompany)) return false;
  if (!textMatches(headline, f.school)) return false;
  return true;
}

function jobMatchesFilters(j: Job, f: SearchFiltersState): boolean {
  const loc = j.location ?? "";
  const title = j.title;
  const company = j.company_name ?? "";
  if (!textMatches(`${loc} ${title}`, f.location)) return false;
  if (!textMatches(`${company} ${title}`, f.currentCompany)) return false;
  if (!textMatches(title, f.pastCompany)) return false;
  if (!textMatches(title, f.school)) return false;
  return true;
}

function SectionHeader({
  icon: Icon,
  title,
  viewAllLabel,
  onViewAll,
}: {
  icon: React.ElementType;
  title: string;
  viewAllLabel: string;
  onViewAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#666]" />
        <h2 className="text-[1.05rem] font-semibold text-[#1f1f1f]">{title}</h2>
      </div>
      <button type="button" onClick={onViewAll} className="text-sm font-semibold text-[#0a66c2] hover:underline">
        {viewAllLabel} →
      </button>
    </div>
  );
}

export function SearchResultsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = authStore((s) => s.userId);

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [scope, setScope] = useState<SearchScope>(() => {
    const s = searchParams.get("scope");
    return s === "people" || s === "jobs" ? s : "all";
  });
  const [filters, setFilters] = useState<SearchFiltersState>(EMPTY_FILTERS);
  const debounced = useDebounce(query, 300);

  const [members, setMembers] = useState<MemberSearchItem[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterProfile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingRecruiters, setLoadingRecruiters] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const [connectedIds, setConnectedIds] = useState<Set<number>>(() => new Set());
  const [pendingOutgoingIds, setPendingOutgoingIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const s = searchParams.get("scope");
    if (s && s !== "all" && s !== "people" && s !== "jobs") {
      const q = searchParams.get("q");
      setSearchParams(q?.trim() ? { q: q.trim() } : {}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    const s = searchParams.get("scope");
    setScope(s === "people" || s === "jobs" ? s : "all");
  }, [searchParams]);

  useEffect(() => {
    setLoadingMembers(true);
    void searchMembers({ keyword: debounced, page: 1 })
      .then((data) => {
        setMembers(data.members);
        setLoadingMembers(false);
      })
      .catch(() => setLoadingMembers(false));

    setLoadingRecruiters(true);
    void searchRecruiters({ name: debounced, page: 1 })
      .then((data) => {
        setRecruiters(data.recruiters);
        setLoadingRecruiters(false);
      })
      .catch(() => setLoadingRecruiters(false));

    setLoadingJobs(true);
    void searchJobs({ keyword: debounced, page: 1 })
      .then((data) => {
        setJobs(data.jobs);
        setLoadingJobs(false);
      })
      .catch(() => setLoadingJobs(false));
  }, [debounced]);

  useEffect(() => {
    if (!userId) {
      setConnectedIds(new Set());
      setPendingOutgoingIds(new Set());
      return;
    }
    let cancelled = false;
    void Promise.all([listConnections(userId), listPendingConnections(userId)])
      .then(([conns, pending]) => {
        if (cancelled) return;
        setConnectedIds(new Set(conns.map((c) => c.connected_user_id)));
        const outgoing = new Set<number>();
        for (const p of pending) {
          const dir = p.direction ?? (p.requester_id === userId ? "outgoing" : "incoming");
          if (dir === "outgoing") outgoing.add(p.receiver_id);
        }
        setPendingOutgoingIds(outgoing);
      })
      .catch(() => {
        if (!cancelled) {
          setConnectedIds(new Set());
          setPendingOutgoingIds(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, debounced]);

  const filteredMembers = useMemo(
    () =>
      members
        .filter((m) => userId == null || m.member_id !== userId)
        .filter((m) => memberMatchesFilters(m, filters)),
    [members, filters, userId]
  );
  const filteredRecruiters = useMemo(
    () =>
      recruiters
        .filter((r) => userId == null || r.recruiter_id !== userId)
        .filter((r) => recruiterMatchesFilters(r, filters)),
    [recruiters, filters, userId]
  );
  const filteredJobs = useMemo(() => jobs.filter((j) => jobMatchesFilters(j, filters)), [jobs, filters]);

  function memberAction(memberId: number): {
    action: "connect" | "message" | "pending";
    onPrimaryAction: () => void;
  } {
    if (connectedIds.has(memberId)) {
      return { action: "message", onPrimaryAction: () => navigate(`/messages?user=${memberId}`) };
    }
    if (pendingOutgoingIds.has(memberId)) {
      return { action: "pending", onPrimaryAction: () => navigate(`/profile/${memberId}`) };
    }
    return { action: "connect", onPrimaryAction: () => navigate(`/profile/${memberId}`) };
  }

  function recruiterAction(recruiterId: number): {
    action: "connect" | "message" | "pending";
    onPrimaryAction: () => void;
  } {
    if (connectedIds.has(recruiterId)) {
      return { action: "message", onPrimaryAction: () => navigate(`/messages?user=${recruiterId}`) };
    }
    if (pendingOutgoingIds.has(recruiterId)) {
      return { action: "pending", onPrimaryAction: () => navigate(`/recruiters/${recruiterId}`) };
    }
    return { action: "connect", onPrimaryAction: () => navigate(`/recruiters/${recruiterId}`) };
  }

  function handleScopeChange(nextScope: SearchScope) {
    setScope(nextScope);
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setSearchParams(nextScope === "all" ? { q: nextQuery } : { q: nextQuery, scope: nextScope });
  }

  function handleSearch() {
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setSearchParams(scope === "all" ? { q: nextQuery } : { q: nextQuery, scope });
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  const trimmedQuery = query.trim();
  const showPeopleSection = scope === "all" || scope === "people";
  const showJobsSection = scope === "all" || scope === "jobs";

  const suggestedPeople = useMemo(() => {
    const rows: SuggestedPerson[] = [];
    const seen = new Set<string>();

    for (const member of filteredMembers) {
      if (rows.length >= 4) break;
      if (userId && member.member_id === userId) continue;
      if (connectedIds.has(member.member_id)) continue;
      const id = `member-${member.member_id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const act = memberAction(member.member_id);
      rows.push({
        id,
        name: `${member.first_name} ${member.last_name}`.trim(),
        subtitle: member.headline?.trim() || "Member",
        location:
          [member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ") ||
          "Location unavailable",
        profilePhotoUrl: member.profile_photo_url ?? null,
        onOpen: () => navigate(`/profile/${member.member_id}`),
        primaryLabel: act.action === "message" ? "Message" : act.action === "pending" ? "Pending" : "Connect",
        onPrimaryAction: act.onPrimaryAction,
      });
    }

    for (const recruiter of filteredRecruiters) {
      if (rows.length >= 4) break;
      if (userId && recruiter.recruiter_id === userId) continue;
      if (connectedIds.has(recruiter.recruiter_id)) continue;
      const id = `recruiter-${recruiter.recruiter_id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const act = recruiterAction(recruiter.recruiter_id);
      rows.push({
        id,
        name: recruiter.name || "Recruiter",
        subtitle: [recruiter.role, recruiter.company_name].filter(Boolean).join(" · ") || "Recruiter",
        location:
          [recruiter.location_city, recruiter.location_state, recruiter.location_country].filter(Boolean).join(", ") ||
          recruiter.company_location ||
          "Location unavailable",
        profilePhotoUrl: recruiter.profile_photo_url ?? null,
        onOpen: () => navigate(`/recruiters/${recruiter.recruiter_id}`),
        primaryLabel: act.action === "message" ? "Message" : act.action === "pending" ? "Pending" : "Connect",
        onPrimaryAction: act.onPrimaryAction,
      });
    }

    return rows;
  }, [filteredMembers, filteredRecruiters, userId, connectedIds, pendingOutgoingIds, navigate]);

  return (
    <SearchResultsLayout
      sidebar={
        <>
          <FilterSidebar filters={filters} onFiltersChange={setFilters} />
          <SuggestedPeopleCard people={suggestedPeople} />
        </>
      }
    >
      <div className="rounded-lg border border-[#e4e6eb] bg-white px-4 py-3">
        <div className="mb-3 flex gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-[15px] top-1/2 z-[1] h-[17px] w-[17px] -translate-y-1/2 text-[#666666]"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              className="h-10 rounded-full border border-solid border-[#d0d7de] bg-white !pl-[3rem] pr-4 text-[0.95rem] caret-[#1f2937] focus:border-[#666666] focus:!shadow-none focus:outline-none"
              aria-label="Search"
              placeholder="Search people, jobs, or posts"
            />
          </div>
          <Button type="button" onClick={handleSearch} className="h-10 shrink-0 rounded-full px-5 py-2 text-sm">
            Search
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {SEARCH_SCOPES.map((item) => {
            const isActive = scope === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleScopeChange(item.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-[7px] text-sm font-semibold leading-none transition-colors ${
                  isActive
                    ? "border-[#057642] bg-[#057642] text-white"
                    : "border-[#dbdbdb] bg-white text-[#3a3a3a] hover:bg-[#f3f2ef]"
                }`}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-[#e4e6eb] bg-white">
        <div className="px-4 pb-1 pt-3">
          <p className="text-[1.22rem] font-semibold text-[#1f1f1f]">Showing results for “{trimmedQuery || "All"}”</p>
        </div>
        {showPeopleSection ? (
          <>
            <SectionHeader
              icon={Users}
              title="People"
              viewAllLabel="View all people"
              onViewAll={() => setSearchParams(trimmedQuery ? { q: trimmedQuery, scope: "people" } : { scope: "people" })}
            />
            {loadingMembers || loadingRecruiters ? (
              <div className="space-y-2 p-4">
                <CardSkeleton />
                <CardSkeleton />
              </div>
            ) : filteredMembers.length === 0 && filteredRecruiters.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[#666]">No people match your search.</p>
            ) : (
              <div>
                {filteredMembers.map((member) => {
                  const act = memberAction(member.member_id);
                  return (
                    <PersonResultCard
                      key={`member-${member.member_id}`}
                      person={{
                        id: member.member_id,
                        name: `${member.first_name} ${member.last_name}`.trim(),
                        headline: member.headline ?? null,
                        location:
                          [member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ") ||
                          null,
                        profilePhotoUrl: member.profile_photo_url ?? null,
                        connectionsCount: member.connections_count > 0 ? member.connections_count : null,
                        badge: member.skills?.[0] ?? null,
                        isVerified: member.is_verified,
                        action: act.action,
                        onPrimaryAction: act.onPrimaryAction,
                        onOpenProfile: () => navigate(`/profile/${member.member_id}`),
                      }}
                    />
                  );
                })}
                {filteredRecruiters.map((recruiter) => {
                  const act = recruiterAction(recruiter.recruiter_id);
                  const cc =
                    recruiter.connections_count != null && recruiter.connections_count > 0 ? recruiter.connections_count : null;
                  return (
                    <PersonResultCard
                      key={`recruiter-${recruiter.recruiter_id}`}
                      person={{
                        id: recruiter.recruiter_id,
                        name: recruiter.name || "Recruiter",
                        headline: [recruiter.role, recruiter.company_name].filter(Boolean).join(" · ") || "Recruiter",
                        location:
                          [recruiter.location_city, recruiter.location_state, recruiter.location_country].filter(Boolean).join(", ") ||
                          recruiter.company_location ||
                          null,
                        profilePhotoUrl: recruiter.profile_photo_url ?? null,
                        connectionsCount: cc,
                        badge: recruiter.skills?.[0] ?? null,
                        action: act.action,
                        onPrimaryAction: act.onPrimaryAction,
                        onOpenProfile: () => navigate(`/recruiters/${recruiter.recruiter_id}`),
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>

      {showJobsSection ? (
        <div className="rounded-lg border border-[#e4e6eb] bg-white">
          <SectionHeader
            icon={BriefcaseBusiness}
            title="Jobs"
            viewAllLabel="View all jobs"
            onViewAll={() => setSearchParams(trimmedQuery ? { q: trimmedQuery, scope: "jobs" } : { scope: "jobs" })}
          />
          {loadingJobs ? (
            <div className="space-y-2 p-4">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredJobs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[#666]">No jobs match your search.</p>
          ) : (
            <div>
              {filteredJobs.slice(0, 4).map((job) => (
                <JobResultCard key={job.job_id} job={job} onOpen={() => navigate(`/jobs/${job.job_id}`)} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </SearchResultsLayout>
  );
}
