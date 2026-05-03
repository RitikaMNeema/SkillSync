JOB_VIEWED               = "job.viewed"
JOB_SAVED                = "job.saved"
JOB_CLOSED               = "job.closed"
JOB_COMMANDS             = "job.commands.v1"
APPLICATION_SUBMITTED    = "application.submitted"
APPLICATION_STATUS_CHANGED = "application.statusChanged"
APPLICATION_COMMANDS     = "application.commands.v1"
MESSAGE_SENT             = "message.sent"
CONNECTION_REQUESTED     = "connection.requested"
CONNECTION_ACCEPTED      = "connection.accepted"
CONNECTION_REMOVED       = "connection.removed"
CONNECTION_COMMANDS      = "connection.commands.v1"
RECRUITER_COMMANDS       = "recruiter.commands.v1"
MESSAGING_COMMANDS       = "messaging.commands.v1"
PROFILE_COMMANDS         = "profile.commands.v1"
AUTH_COMMANDS            = "auth.commands.v1"
AI_COMMANDS              = "ai.commands.v1"
PROFILE_UPDATED          = "profile.updated"
PROFILE_VIEWED           = "profile.viewed"
MEMBER_SEARCH_APPEARED      = "member.searchAppeared"
RECRUITER_SEARCH_APPEARED   = "recruiter.searchAppeared"
POST_CREATED             = "post.created"
POST_LIKED               = "post.liked"
POST_COMMENTED           = "post.commented"
POST_DELETED             = "post.deleted"

ALL_TOPICS = [
    JOB_VIEWED, JOB_SAVED, JOB_CLOSED,
    APPLICATION_SUBMITTED, APPLICATION_STATUS_CHANGED,
    MESSAGE_SENT, CONNECTION_REQUESTED, CONNECTION_ACCEPTED, CONNECTION_REMOVED,
    PROFILE_UPDATED, PROFILE_VIEWED, MEMBER_SEARCH_APPEARED, RECRUITER_SEARCH_APPEARED,
    POST_CREATED, POST_LIKED, POST_COMMENTED, POST_DELETED
]


def dlq_topic(topic: str) -> str:
    return f"{topic}.dlq"
