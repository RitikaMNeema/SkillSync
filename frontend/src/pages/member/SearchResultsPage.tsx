import { BriefcaseBusiness, MapPin, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchMembers } from "../../api/members";
import { searchJobs } from "../../api/jobs";
import { searchRecruiters } from "../../api/recruiters";
import { JobCard } from "../../components/jobs/JobCard";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { useDebounce } from "../../hooks/useDebounce";
import type { MemberSearchItem } from "../../types/member";
import type { Job } from "../../types/job";
import type { RecruiterProfile } from "../../types/recruiter";

function MemberCard({ member }: { member: MemberSearchItem }) {
  const location = [member.location_city, member.location_state].filter(Boolean).join(", ");
  return (
    <Link
      to={`/profile/${member.member_id}`}
      className="flex items-start gap-4 rounded-card border bg-white p-4 hover:bg-hover hover:no-underline transition-colors"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
        {member.first_name[0]}{member.last_name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text-primary">{member.first_name} {member.last_name}</p>
        {member.headline && <p className="text-sm text-text-secondary line-clamp-1">{member.headline}</p>}
        {location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
            <MapPin className="h-3 w-3" />{location}
          </p>
        )}
        {member.skills && member.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {member.skills.slice(0, 5).map((skill) => (
              <span key={skill} className="rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-xs text-brand">
                {skill}
              </span>
            ))}
            {member.skills.length > 5 && (
              <span className="rounded-full border px-2 py-0.5 text-xs text-text-tertiary">+{member.skills.length - 5} more</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function RecruiterCard({ recruiter }: { recruiter: RecruiterProfile }) {
  const subtitle = [recruiter.role, recruiter.company_name].filter(Boolean).join(" · ");
  const location = recruiter.company_location || "";
  return (
    <Link
      to={`/profile/${recruiter.recruiter_id}?type=recruiter`}
      className="flex items-start gap-4 rounded-card border bg-white p-4 transition-colors hover:bg-hover hover:no-underline"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0a66c2] text-lg font-bold text-white">
        {recruiter.name?.[0]?.toUpperCase() || "R"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text-primary">{recruiter.name}</p>
        {subtitle ? <p className="text-sm text-text-secondary line-clamp-1">{subtitle}</p> : null}
        {location ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
            <MapPin className="h-3 w-3" />{location}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <Icon className="h-5 w-5 text-text-secondary" />
      <h2 className="font-semibold text-text-primary">{title}</h2>
      <span className="text-sm text-text-tertiary">({count})</span>
    </div>
  );
}

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounced = useDebounce(query, 300);

  const [members, setMembers] = useState<MemberSearchItem[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterProfile[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [recruitersTotal, setRecruitersTotal] = useState(0);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingRecruiters, setLoadingRecruiters] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setLoadingMembers(true);
    void searchMembers({ keyword: debounced, page: 1 }).then((data) => {
      setMembers(data.members);
      setMembersTotal(data.total);
      setLoadingMembers(false);
    }).catch(() => setLoadingMembers(false));

    setLoadingRecruiters(true);
    void searchRecruiters({ name: debounced, page: 1 }).then((data) => {
      setRecruiters(data.recruiters);
      setRecruitersTotal(data.total);
      setLoadingRecruiters(false);
    }).catch(() => setLoadingRecruiters(false));

    setLoadingJobs(true);
    void searchJobs({ keyword: debounced, page: 1 }).then((data) => {
      setJobs(data.jobs);
      setJobsTotal(data.total);
      setLoadingJobs(false);
    }).catch(() => setLoadingJobs(false));
  }, [debounced]);

  function handleSearch() {
    if (query.trim()) setSearchParams({ q: query.trim() });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-[60px] z-40 rounded-card bg-[#eef3f8] p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="border-0 bg-white !pl-9"
              placeholder="Search people, jobs, skills..."
            />
          </div>
          <Button type="button" onClick={handleSearch}>Search</Button>
        </div>
      </div>

      <div className="space-y-4">
        <SectionHeader icon={Users} title="People" count={membersTotal + recruitersTotal} />
        {loadingMembers || loadingRecruiters ? (
          <><CardSkeleton /><CardSkeleton /></>
        ) : members.length === 0 && recruiters.length === 0 ? (
          <p className="text-sm text-text-tertiary">No people match your search.</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => <MemberCard key={m.member_id} member={m} />)}
            {recruiters.map((r) => <RecruiterCard key={r.recruiter_id} recruiter={r} />)}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <SectionHeader icon={BriefcaseBusiness} title="Jobs" count={jobsTotal} />
        {loadingJobs ? (
          <><CardSkeleton /><CardSkeleton /></>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-text-tertiary">No jobs match your search.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => <JobCard key={job.job_id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}
