import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  Image,
  MessageSquare,
  Plus,
  Sparkles
} from "lucide-react";
import toast from "react-hot-toast";
import { getMemberDashboard, getTopJobs } from "../../api/analytics";
import { getApplicationsByMember } from "../../api/applications";
import { listConnections, listPendingConnections, requestConnection } from "../../api/connections";
import { getSavedJobs, getJob, saveJob, searchJobs, unsaveJob } from "../../api/jobs";
import { createMember, getMember, searchMembers } from "../../api/members";
import { createPost, getFeedPosts, uploadPostImage } from "../../api/posts";
import { searchRecruiters } from "../../api/recruiters";
import { RightSidebar, Sidebar } from "../../components/layout/Sidebar";
import { PostCard } from "../../components/posts/PostCard";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input, Textarea } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Application } from "../../types/application";
import type { MemberDashboard } from "../../types/analytics";
import type { Job } from "../../types/job";
import type { MemberProfile, MemberSearchItem } from "../../types/member";
import type { FeedPost, PostType } from "../../types/post";
import type { RecruiterProfile } from "../../types/recruiter";
import { formatRelativeDate } from "../../utils/formatDate";
import { getApiErrorMessage, getHttpStatus } from "../../utils/getApiErrorMessage";
import { getStatusColor } from "../../utils/getStatusColor";

const composerActions: Array<{ type: PostType; label: string; icon: typeof Image }> = [
  { type: "photo", label: "Photo", icon: Image },
  { type: "article", label: "Article", icon: FileText }
];

function currentMonthKey() {
  return new Date().toISOString().slice(0, 10);
}

export function FeedPage() {
  const navigate = useNavigate();
  const userId = authStore((state) => state.userId);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<number[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [peopleSuggestions, setPeopleSuggestions] = useState<MemberSearchItem[]>([]);
  const [recruiterSuggestions, setRecruiterSuggestions] = useState<RecruiterProfile[]>([]);
  const [dashboard, setDashboard] = useState<MemberDashboard | null>(null);
  const [trendingJobs, setTrendingJobs] = useState<Job[]>([]);
  const [pendingConnectionIds, setPendingConnectionIds] = useState<number[]>([]);
  const [connectedUserIds, setConnectedUserIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<PostType>("post");
  const [composerText, setComposerText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);

  async function loadFeed() {
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      let member: MemberProfile;
      try {
        member = await getMember(userId);
      } catch (memberError) {
        if (getHttpStatus(memberError) !== 404) throw memberError;
        // Some users can authenticate before a member profile row exists.
        await createMember({
          member_id: userId,
          first_name: "First",
          last_name: "Last"
        });
        member = await getMember(userId);
      }
      setProfile(member);

      const keyword = member.skills?.[0] || member.headline?.split(" ")[0] || undefined;
      const location = member.location_city || undefined;

      const results = await Promise.allSettled([
        searchJobs({ keyword, location, page: 1 }),
        getApplicationsByMember(userId),
        getSavedJobs(userId),
        getFeedPosts(1),
        searchMembers({ location, page: 1 }),
        searchRecruiters({ page: 1 }),
        listConnections(userId),
        listPendingConnections(userId),
        getMemberDashboard(userId),
        getTopJobs(currentMonthKey())
      ]);

      const recommendedJobs = results[0].status === "fulfilled" ? results[0].value.jobs.slice(0, 3) : [];
      const applicationItems = results[1].status === "fulfilled" ? results[1].value.applications.slice(0, 4) : [];
      const savedJobs = results[2].status === "fulfilled" ? results[2].value.jobs : [];
      const feedPosts = results[3].status === "fulfilled" ? results[3].value.posts.slice(0, 5) : [];
      const memberResults = results[4].status === "fulfilled" ? results[4].value.members : [];
      const recruiterResults = results[5].status === "fulfilled" ? results[5].value.recruiters.slice(0, 3) : [];
      const connectionResults = results[6].status === "fulfilled" ? results[6].value : [];
      const pendingResults = results[7].status === "fulfilled" ? results[7].value : [];
      const dashboardResult = results[8].status === "fulfilled" ? results[8].value : null;

      setJobs(recommendedJobs);
      setApplications(applicationItems);
      setSavedJobIds(savedJobs.map((job) => job.job_id));
      setPosts(feedPosts);
      setRecruiterSuggestions(recruiterResults);
      setConnectedUserIds(connectionResults.map((connection) => connection.connected_user_id));
      setPendingConnectionIds(pendingResults.map((request) => request.requester_id));
      setDashboard(dashboardResult);

      const blockedIds = new Set<number>([
        userId,
        ...connectionResults.map((connection) => connection.connected_user_id),
        ...pendingResults.map((request) => request.requester_id)
      ]);
      setPeopleSuggestions(memberResults.filter((memberItem) => !blockedIds.has(memberItem.member_id)).slice(0, 3));

      if (results[9].status === "fulfilled" && results[9].value.length > 0) {
        const topJobResults = await Promise.allSettled(results[9].value.slice(0, 3).map((metric) => getJob(Number(metric.job_id))));
        setTrendingJobs(
          topJobResults
            .filter((result): result is PromiseFulfilledResult<Job> => result.status === "fulfilled")
            .map((result) => result.value)
        );
      } else {
        setTrendingJobs([]);
      }
    } catch {
      setError("Could not load your home feed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed();
  }, [userId]);

  const applicationSummary = useMemo(() => {
    if (!dashboard?.application_status_breakdown?.length) return [];
    return dashboard.application_status_breakdown.filter((item) => item.count > 0).slice(0, 3);
  }, [dashboard]);

  async function handleCreatePost() {
    if (!userId) return;

    const hasText = composerText.trim().length > 0;
    const hasMedia = imageFile !== null || mediaUrl.trim().length > 0;
    if (!hasText && !hasMedia) {
      toast.error("Add text or an image");
      return;
    }

    setPosting(true);
    const loadingToast = toast.loading("Publishing post...");
    try {
      let finalMediaUrl = mediaUrl.trim() || undefined;
      if (imageFile) {
        setUploadingImage(true);
        finalMediaUrl = await uploadPostImage(imageFile);
        setUploadingImage(false);
      }

      const post = await createPost({
        member_id: userId,
        content: composerText.trim(),
        post_type: imageFile ? "photo" : composerType,
        media_url: finalMediaUrl
      });
      setPosts((current) => [post, ...current].slice(0, 5));
      setComposerText("");
      setMediaUrl("");
      setImageFile(null);
      setComposerType("post");
      setComposerOpen(false);
      toast.success("Post published", { id: loadingToast });
    } catch (submitError: unknown) {
      const detail = getApiErrorMessage(submitError);
      toast.error(detail || "Could not publish your post", { id: loadingToast });
    } finally {
      setPosting(false);
      setUploadingImage(false);
    }
  }

  async function handleToggleSave(job: Job) {
    if (!userId) return;

    const saved = savedJobIds.includes(job.job_id);
    const loadingToast = toast.loading(saved ? "Removing saved job..." : "Saving job...");

    try {
      if (saved) {
        await unsaveJob(userId, job.job_id);
        setSavedJobIds((current) => current.filter((id) => id !== job.job_id));
      } else {
        await saveJob(userId, job.job_id);
        setSavedJobIds((current) => [...current, job.job_id]);
      }
      toast.success(saved ? "Removed from saved jobs" : "Saved job", { id: loadingToast });
    } catch {
      toast.error("Could not update saved jobs", { id: loadingToast });
    }
  }

  async function handleConnect(memberId: number) {
    if (!userId) return;

    const loadingToast = toast.loading("Sending invitation...");
    try {
      await requestConnection(userId, memberId);
      setPendingConnectionIds((current) => [...current, memberId]);
      setPeopleSuggestions((current) => current.filter((memberItem) => memberItem.member_id !== memberId));
      toast.success("Invitation sent", { id: loadingToast });
    } catch {
      toast.error("Could not send invitation", { id: loadingToast });
    }
  }

  function openComposer(type: PostType) {
    setComposerType(type);
    setComposerOpen(true);
  }

  function goToJobs(params?: Record<string, string>) {
    const search = new URLSearchParams(params);
    navigate(search.size ? `/jobs?${search.toString()}` : "/jobs");
  }

  function goToConnectionsPage() {
    navigate("/connections");
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,554px)_300px]">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error || !profile) {
    return <Alert message={error || "Could not load your home feed."} onRetry={() => void loadFeed()} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,554px)_300px]">
      <Sidebar>
        <Card className="overflow-hidden p-0">
          <div className="h-[60px] bg-gradient-to-r from-[#1d4477] to-[#1568bf]" />
          <div className="-mt-9 px-4 pb-4">
            <Avatar
              src={profile.profile_photo_url}
              alt={`${profile.first_name} ${profile.last_name}`}
              name={`${profile.first_name} ${profile.last_name}`}
              size="xl"
            />
            <button
              type="button"
              className="mt-3 block text-left hover:underline"
              onClick={() => navigate(`/profile/${profile.member_id}`)}
            >
              <p className="font-semibold">
                {profile.first_name} {profile.last_name}
              </p>
              <p className="text-sm text-text-secondary">{profile.headline || "Complete your profile headline"}</p>
            </button>
            <div className="mt-4 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span>Profile views</span>
                <span>{profile.profile_views ?? 0}</span>
              </div>
              <button
                type="button"
                className="flex w-full justify-between text-left hover:text-brand"
                onClick={goToConnectionsPage}
              >
                <span>Connections</span>
                <span>{profile.connections_count ?? 0}</span>
              </button>
            </div>
            <Button fullWidth variant="secondary" className="mt-4" onClick={() => navigate(`/profile/${profile.member_id}`)}>
              View profile
            </Button>
          </div>
        </Card>
      </Sidebar>
      <div className="space-y-4">
        <Card>
          <div className="flex gap-3">
            <Avatar
              src={profile.profile_photo_url}
              alt={`${profile.first_name} ${profile.last_name}`}
              name={`${profile.first_name} ${profile.last_name}`}
            />
            <button
              type="button"
              className="flex-1 rounded-pill border px-4 py-2 text-left text-text-secondary hover:bg-hover"
              onClick={() => openComposer("post")}
            >
              Start a post, {profile.first_name}
            </button>
          </div>
          <div className="mt-4 flex justify-between text-sm text-text-secondary">
            {composerActions.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" className="inline-flex items-center gap-2 hover:text-brand" onClick={() => openComposer(type)}>
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          {composerOpen ? (
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">Post</p>
                <p className="text-xs font-medium text-text-secondary">
                  {composerType === "photo" ? "Photo" : composerType === "article" ? "Article" : "Text"}
                </p>
              </div>
              <Textarea
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                placeholder={
                  composerType === "photo"
                    ? "Add an optional caption…"
                    : composerType === "article"
                      ? "Share context or a takeaway…"
                      : "Share what's on your mind…"
                }
              />
              {composerType === "photo" ? (
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed px-4 py-3 text-sm text-text-secondary hover:bg-hover">
                    <Image className="h-4 w-4" />
                    {imageFile ? imageFile.name : "Choose an image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file && file.size > 5 * 1024 * 1024) {
                          toast.error("Image must be under 5MB");
                          return;
                        }
                        setImageFile(file);
                      }}
                    />
                  </label>
                  {imageFile ? (
                    <button
                      type="button"
                      className="text-xs text-text-secondary hover:text-text-primary"
                      onClick={() => setImageFile(null)}
                    >
                      Remove image
                    </button>
                  ) : null}
                </div>
              ) : composerType !== "post" ? (
                <Input
                  value={mediaUrl}
                  onChange={(event) => setMediaUrl(event.target.value)}
                  placeholder="Optional media URL"
                />
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setComposerType("post");
                    setMediaUrl("");
                    setImageFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCreatePost()}
                  disabled={posting || uploadingImage || (!composerText.trim() && !imageFile && !mediaUrl.trim())}
                >
                  {uploadingImage ? "Uploading..." : "Publish"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent posts</h2>
            <Button variant="ghost" onClick={() => openComposer("post")}>
              Create one
            </Button>
          </div>
          {posts.length > 0 && userId != null ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.post_id}
                  post={post}
                  viewerId={userId}
                  onUpdate={(updated) =>
                    setPosts((current) =>
                      current.map((p) => (p.post_id === updated.post_id ? updated : p))
                    )
                  }
                  onDelete={(postId) => setPosts((current) => current.filter((p) => p.post_id !== postId))}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No posts yet"
              description="Your updates will show up here once you publish your first post."
              actionLabel="Write a post"
              onAction={() => openComposer("post")}
            />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Jobs based on your profile</h2>
            <Button variant="ghost" onClick={() => goToJobs({ keyword: profile.skills?.[0] || "", location: profile.location_city || "" })}>
              See all
            </Button>
          </div>
          {jobs.length ? (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.job_id} className="flex items-center justify-between gap-3 rounded-card p-3 hover:bg-hover">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/jobs/${job.job_id}`)}>
                    <p className="font-semibold">{job.title}</p>
                    <p className="text-sm text-text-secondary">
                      {job.company_name} {job.location ? `· ${job.location}` : ""}
                    </p>
                  </button>
                  <Button variant={savedJobIds.includes(job.job_id) ? "secondary" : "ghost"} onClick={() => void handleToggleSave(job)}>
                    {savedJobIds.includes(job.job_id) ? "Saved" : "Save"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No job matches yet"
              description="Try broadening your profile details or load sample data to get recommendations."
              actionLabel="Browse all jobs"
              onAction={() => goToJobs()}
            />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your application updates</h2>
            <Button variant="ghost" onClick={() => navigate("/applications")}>
              See all
            </Button>
          </div>
          {applications.length ? (
            <div className="space-y-3">
              {applications.map((application) => (
                <button
                  key={application.application_id}
                  type="button"
                  className="block w-full rounded-card p-3 text-left hover:bg-hover"
                  onClick={() => navigate("/applications")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{application.job_title || `Application #${application.application_id}`}</p>
                      <p className="text-sm text-text-secondary">
                        {application.company_name || "Company"} · {formatRelativeDate(application.application_datetime)}
                      </p>
                    </div>
                    <Badge className={getStatusColor(application.status)}>{application.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No applications yet"
              description="Once you apply to jobs, status updates will appear here."
              actionLabel="Find jobs"
              onAction={() => goToJobs()}
            />
          )}
        </Card>
      </div>
      <RightSidebar>
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add to your feed</h3>
              <Sparkles className="h-5 w-5 text-brand" />
            </div>
            {recruiterSuggestions.length ? (
              <div className="space-y-3">
                {recruiterSuggestions.map((recruiter) => (
                  <div key={recruiter.recruiter_id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{recruiter.company_name}</p>
                      <p className="text-sm text-text-secondary">{recruiter.name}</p>
                      <p className="text-sm text-text-secondary">{recruiter.industry || "Company"}</p>
                    </div>
                    <Button variant="secondary" onClick={() => goToJobs({ industry: recruiter.industry || "", location: profile.location_city || "" })}>
                      View jobs
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Recruiter and company suggestions will appear here as data grows.</p>
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">LinkedIn News</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-card bg-hover p-3">
                <p className="font-semibold text-text-primary">{dashboard?.profile_views_30d ?? 0} profile views in the last 30 days</p>
                <p className="mt-1 text-text-secondary">Your profile visibility is now connected to backend analytics.</p>
              </div>
              {applicationSummary.map((item) => (
                <div key={item.status} className="flex items-center justify-between rounded-card border p-3">
                  <span className="font-medium capitalize">{item.status}</span>
                  <Badge className={getStatusColor(item.status)}>{item.count}</Badge>
                </div>
              ))}
              {trendingJobs.map((job) => (
                <button
                  key={job.job_id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-card border p-3 text-left hover:bg-hover"
                  onClick={() => navigate(`/jobs/${job.job_id}`)}
                >
                  <div>
                    <p className="font-semibold">{job.title}</p>
                    <p className="text-text-secondary">{job.company_name}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-brand" />
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">People you may know</h3>
            {peopleSuggestions.length ? (
              <div className="mt-4 space-y-3">
                {peopleSuggestions.map((member) => (
                  <div key={member.member_id} className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/profile/${member.member_id}`)}>
                      <p className="font-semibold">
                        {member.first_name} {member.last_name}
                      </p>
                      <p className="text-sm text-text-secondary">{member.headline || "Member"}</p>
                    </button>
                    <Button
                      variant="secondary"
                      onClick={() => void handleConnect(member.member_id)}
                      disabled={pendingConnectionIds.includes(member.member_id) || connectedUserIds.includes(member.member_id)}
                    >
                      {connectedUserIds.includes(member.member_id)
                        ? "Connected"
                        : pendingConnectionIds.includes(member.member_id)
                          ? "Pending"
                          : "Connect"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-text-secondary">You are caught up on connection suggestions right now.</span>
                <Plus className="h-5 w-5 text-brand" />
              </div>
            )}
          </Card>
        </div>
      </RightSidebar>
    </div>
  );
}
