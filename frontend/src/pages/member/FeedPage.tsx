import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Image, UserRoundPlus, ShieldCheck, MessageSquare, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { getMemberDashboard, getRecruiterProfileDashboard, getTopJobs } from "../../api/analytics";
import { getMutualConnections, listConnections, listPendingConnections, requestConnection, withdrawConnection } from "../../api/connections";
import { getJob, searchJobs } from "../../api/jobs";
import { createMember, searchMembers } from "../../api/members";
import { createPost, getFeedPosts, uploadPostImage } from "../../api/posts";
import { RightSidebar, Sidebar } from "../../components/layout/Sidebar";
import { PostCard } from "../../components/posts/PostCard";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input, Textarea } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useAuthHydrated } from "../../hooks/useAuthHydrated";
import type { MemberDashboard, RecruiterProfileDashboard } from "../../types/analytics";
import type { Job } from "../../types/job";
import type { MemberProfile, MemberSearchItem } from "../../types/member";
import type { FeedPost, PostType } from "../../types/post";
import { getApiErrorMessage, getHttpStatus } from "../../utils/getApiErrorMessage";
import { getUnifiedProfile, type UnifiedProfileResolution } from "../../utils/profileAdapter";
import type { PendingConnection } from "../../types/connection";

const composerActions: Array<{ type: PostType; label: string; icon: typeof Image }> = [
  { type: "photo", label: "Photo", icon: Image },
  { type: "article", label: "Article", icon: FileText }
];

function currentMonthKey() {
  return new Date().toISOString().slice(0, 10);
}

function pendingCounterpartyId(request: PendingConnection, userId: number): number {
  const direction =
    request.direction ??
    (request.requester_id === userId ? "outgoing" : "incoming");
  return direction === "incoming" ? request.requester_id : request.receiver_id;
}

function isRecruiterProfileDashboard(
  dash: MemberDashboard | RecruiterProfileDashboard | null
): dash is RecruiterProfileDashboard {
  return dash != null && "job_views_30d" in dash;
}

function outgoingPendingIndex(pendingRequests: PendingConnection[], userId: number): {
  ids: number[];
  requestIdsByMember: Record<number, number>;
} {
  const outgoing = pendingRequests.filter((request) => {
    const direction =
      request.direction ??
      (request.requester_id === userId ? "outgoing" : "incoming");
    return direction === "outgoing";
  });
  return {
    ids: outgoing.map((request) => pendingCounterpartyId(request, userId)),
    requestIdsByMember: Object.fromEntries(
      outgoing.map((request) => [pendingCounterpartyId(request, userId), request.id] as const)
    )
  };
}

export function FeedPage() {
  const navigate = useNavigate();
  const authHydrated = useAuthHydrated();
  const { userId, role } = authStore(useShallow((state) => ({ userId: state.userId, role: state.role })));
  /** Set from `getUnifiedProfile` so sidebar + analytics match DB row, not a possibly stale `role` before persist hydrates. */
  const [feedResolvedAs, setFeedResolvedAs] = useState<UnifiedProfileResolution | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [peopleSuggestions, setPeopleSuggestions] = useState<MemberSearchItem[]>([]);
  const [dashboard, setDashboard] = useState<MemberDashboard | RecruiterProfileDashboard | null>(null);
  const [trendingJobs, setTrendingJobs] = useState<Job[]>([]);
  const [pendingConnectionIds, setPendingConnectionIds] = useState<number[]>([]);
  const [pendingRequestIdsByMember, setPendingRequestIdsByMember] = useState<Record<number, number>>({});
  const [pendingActionMemberId, setPendingActionMemberId] = useState<number | null>(null);
  const [hoveredPendingMemberId, setHoveredPendingMemberId] = useState<number | null>(null);
  const [connectedUserIds, setConnectedUserIds] = useState<number[]>([]);
  const [suggestionDegrees, setSuggestionDegrees] = useState<Record<number, "2nd" | "3rd+">>({});
  const [suggestionMutualCounts, setSuggestionMutualCounts] = useState<Record<number, number>>({});
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
    setFeedResolvedAs(null);

    try {
      let member: MemberProfile;
      let resolvedAs: UnifiedProfileResolution;
      try {
        const loaded = await getUnifiedProfile(userId, role);
        member = loaded.profile;
        resolvedAs = loaded.resolvedAs;
      } catch (firstErr) {
        // Recruiters only exist in `recruiters`; never bootstrap a member row for them.
        if (role === "recruiter") throw firstErr;
        if (getHttpStatus(firstErr) !== 404) throw firstErr;
        await createMember({
          member_id: userId,
          first_name: "First",
          last_name: "Last",
          headline: "Aspiring professional"
        });
        const loaded = await getUnifiedProfile(userId, role);
        member = loaded.profile;
        resolvedAs = loaded.resolvedAs;
      }
      setProfile(member);
      setFeedResolvedAs(resolvedAs);

      const location = member.location_city || undefined;

      const dashboardRequest =
        resolvedAs === "recruiter" ? getRecruiterProfileDashboard(userId) : getMemberDashboard(userId);

      const results = await Promise.allSettled([
        getFeedPosts(1),
        searchMembers({ location, page: 1 }),
        listConnections(userId),
        listPendingConnections(userId),
        dashboardRequest,
        getTopJobs(currentMonthKey())
      ]);

      const feedPosts = results[0].status === "fulfilled" ? results[0].value.posts.slice(0, 5) : [];
      const memberResults = results[1].status === "fulfilled" ? results[1].value.members : [];
      const connectionResults =
        results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value : [];
      const pendingResults =
        results[3].status === "fulfilled" && Array.isArray(results[3].value) ? results[3].value : [];
      const dashboardResult = results[4].status === "fulfilled" ? results[4].value : null;
      setPosts(feedPosts);
      setConnectedUserIds(connectionResults.map((connection) => connection.connected_user_id));
      const pendingIndex = outgoingPendingIndex(pendingResults, userId);
      setPendingConnectionIds(pendingIndex.ids);
      setPendingRequestIdsByMember(pendingIndex.requestIdsByMember);
      setDashboard(dashboardResult);

      const blockedIds = new Set<number>([
        userId,
        ...connectionResults.map((connection) => connection.connected_user_id)
      ]);
      const suggestions = memberResults.filter((memberItem) => !blockedIds.has(memberItem.member_id)).slice(0, 3);
      setPeopleSuggestions(suggestions);
      const degreeById: Record<number, "2nd" | "3rd+"> = {};
      const mutualCountById: Record<number, number> = {};
      if (suggestions.length) {
        const mutualLookups = await Promise.allSettled(
          suggestions.map(async (memberItem) => ({
            memberId: memberItem.member_id,
            result: await getMutualConnections(userId, memberItem.member_id)
          }))
        );
        for (const lookup of mutualLookups) {
          if (lookup.status !== "fulfilled") continue;
          const count = lookup.value.result.count ?? 0;
          mutualCountById[lookup.value.memberId] = count;
          degreeById[lookup.value.memberId] = count > 0 ? "2nd" : "3rd+";
        }
      }
      setSuggestionDegrees(degreeById);
      setSuggestionMutualCounts(mutualCountById);

      if (results[5].status === "fulfilled" && results[5].value.length > 0) {
        const topJobResults = await Promise.allSettled(results[5].value.slice(0, 3).map((metric) => getJob(Number(metric.job_id))));
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
    if (!authHydrated) return;
    if (!userId) {
      setLoading(false);
      setProfile(null);
      setFeedResolvedAs(null);
      return;
    }
    void loadFeed();
  }, [userId, role, authHydrated]);

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

  async function handleConnect(memberId: number) {
    if (!userId) return;

    const isPending = pendingConnectionIds.includes(memberId);
    setPendingActionMemberId(memberId);
    const loadingToast = toast.loading(isPending ? "Withdrawing invitation..." : "Sending invitation...");
    try {
      if (isPending) {
        let requestId = pendingRequestIdsByMember[memberId];
        if (!requestId) {
          const latestPending = await listPendingConnections(userId);
          const pendingIndex = outgoingPendingIndex(latestPending, userId);
          setPendingConnectionIds(pendingIndex.ids);
          setPendingRequestIdsByMember(pendingIndex.requestIdsByMember);
          requestId = pendingIndex.requestIdsByMember[memberId];
        }
        if (!requestId) throw new Error("Pending invitation not found");
        await withdrawConnection(requestId);
        setPendingConnectionIds((current) => current.filter((id) => id !== memberId));
        setPendingRequestIdsByMember((current) => {
          const next = { ...current };
          delete next[memberId];
          return next;
        });
        toast.success("Invitation withdrawn", { id: loadingToast });
        return;
      }

      await requestConnection(userId, memberId);
      const latestPending = await listPendingConnections(userId);
      const pendingIndex = outgoingPendingIndex(latestPending, userId);
      setPendingConnectionIds(pendingIndex.ids);
      setPendingRequestIdsByMember(pendingIndex.requestIdsByMember);
      toast.success("Invitation sent", { id: loadingToast });
    } catch {
      toast.error(isPending ? "Could not withdraw invitation" : "Could not send invitation", { id: loadingToast });
    } finally {
      setPendingActionMemberId((current) => (current === memberId ? null : current));
    }
  }

  function openComposer(type: PostType) {
    setComposerType(type);
    setComposerOpen(true);
  }

  function goToConnectionsPage() {
    navigate("/connections");
  }

  if (loading || !authHydrated) {
    return (
      <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,1fr)_300px]">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error || !profile) {
    return <Alert message={error || "Could not load your home feed."} onRetry={() => void loadFeed()} />;
  }

  const ownProfileUrl =
    feedResolvedAs === "recruiter" || role === "recruiter"
      ? `/profile/${profile.member_id}?type=recruiter`
      : `/profile/${profile.member_id}`;

  /** Same source as `/connections`: live graph from `listConnections`. Recruiter `connections_count` in MySQL can lag if Kafka sync missed; members row is updated more reliably. */
  const feedConnectionsCount = Math.max(connectedUserIds.length, profile.connections_count ?? 0);

  /** Analytics 30d total; fall back to SQL `profile_views` on the profile row when events are empty (matches richer seeker card when DB has counts). */
  const feedProfileViewersCount = Math.max(
    dashboard?.profile_views_30d ?? 0,
    profile.profile_views ?? 0
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,1fr)_300px]">
      <Sidebar>
        <Card className="overflow-hidden rounded-2xl border border-[#dde3ea] p-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="h-[68px] bg-gradient-to-r from-[#1d4477] to-[#1568bf]" />
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
              onClick={() => navigate(ownProfileUrl)}
            >
              <p className="text-[1.35rem] font-semibold leading-tight text-[#1f1f1f]">
                {profile.first_name} {profile.last_name}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{profile.headline || "Complete your profile headline"}</p>
              <p className="mt-1 text-sm text-[#5f6368]">
                {[profile.location_city, profile.location_state, profile.location_country].filter(Boolean).join(", ") || "Location not set"}
              </p>
            </button>
            <div className="mt-4 space-y-2 border-t border-[#e6eaef] pt-4 text-sm">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left font-semibold text-[#444] hover:text-brand"
                onClick={() =>
                  navigate(
                    feedResolvedAs === "recruiter" || role === "recruiter"
                      ? "/recruiter/analytics/profile"
                      : "/dashboard"
                  )
                }
              >
                <span>Profile viewers</span>
                <span className="font-semibold text-brand">{feedProfileViewersCount}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between text-left font-semibold text-[#444] hover:text-brand"
                onClick={goToConnectionsPage}
              >
                <span>Connections</span>
                <span className="font-semibold text-brand">{feedConnectionsCount}</span>
              </button>
            </div>
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
                aria-label={
                  composerType === "photo"
                    ? "Caption for photo post"
                    : composerType === "article"
                      ? "Article post text"
                      : "Post text"
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
                <Input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} aria-label="Media URL" />
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

      </div>
      <RightSidebar>
        <div className="space-y-4">
          <Card>
            <h3 className="text-lg font-semibold">LinkedIn News</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-card bg-hover p-3">
                <p className="font-semibold text-text-primary">{dashboard?.profile_views_30d ?? 0} profile views in the last 30 days</p>
                <p className="mt-1 text-text-secondary">
                  {(feedResolvedAs === "recruiter" || role === "recruiter") && isRecruiterProfileDashboard(dashboard)
                    ? `${dashboard.job_views_30d} job views · ${dashboard.applicants_30d} applicants · ${dashboard.messages_sent_30d} messages sent`
                    : "Your profile visibility is now connected to backend analytics."}
                </p>
              </div>
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
            <p className="mt-1 text-sm text-text-secondary">From your school and network</p>
            {peopleSuggestions.length ? (
              <div className="mt-4 space-y-3">
                {peopleSuggestions.map((member) => (
                  <div key={member.member_id} className="rounded-card border border-[#e5e7eb] p-3">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={member.profile_photo_url ?? undefined}
                        name={`${member.first_name} ${member.last_name}`}
                        alt={`${member.first_name} ${member.last_name}`}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/profile/${member.member_id}`)}>
                        <div className="flex items-center gap-1">
                          <p className="truncate text-[1rem] font-semibold text-[#1f1f1f]">
                            {member.first_name} {member.last_name}
                          </p>
                          {member.is_verified ? <ShieldCheck className="h-4 w-4 text-[#6b7280]" /> : null}
                          <span className="text-sm text-[#6b7280]">{suggestionDegrees[member.member_id] || "3rd+"}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">{member.headline || "Building their professional profile."}</p>
                        {suggestionMutualCounts[member.member_id] > 0 ? (
                          <p className="mt-1 text-xs text-[#6b7280]">{suggestionMutualCounts[member.member_id]} mutual connection{suggestionMutualCounts[member.member_id] === 1 ? "" : "s"}</p>
                        ) : null}
                      </button>
                    </div>
                    <Button
                      variant="secondary"
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 font-semibold ${
                        pendingConnectionIds.includes(member.member_id)
                          ? "border-[#9ca3af] text-[#6b7280] hover:bg-[#f8fafc]"
                          : "border-[#6b7280] text-[#1f2937]"
                      }`}
                      onClick={() => void handleConnect(member.member_id)}
                      onMouseEnter={() => {
                        if (pendingConnectionIds.includes(member.member_id)) {
                          setHoveredPendingMemberId(member.member_id);
                        }
                      }}
                      onMouseLeave={() => {
                        if (hoveredPendingMemberId === member.member_id) {
                          setHoveredPendingMemberId(null);
                        }
                      }}
                      disabled={connectedUserIds.includes(member.member_id) || pendingActionMemberId === member.member_id}
                    >
                      <UserRoundPlus className="h-4 w-4" />
                      {connectedUserIds.includes(member.member_id)
                        ? "Connected"
                        : pendingConnectionIds.includes(member.member_id)
                          ? hoveredPendingMemberId === member.member_id
                            ? "Withdraw"
                            : "Pending"
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
