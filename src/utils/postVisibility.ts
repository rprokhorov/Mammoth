import type { PostData } from "@/stores/messagesStore";

/**
 * System posts about channel/team membership. They carry no useful content for
 * the reader, so they are never rendered — see isRenderablePost.
 */
const HIDDEN_SYSTEM_POST_TYPES = new Set([
  "system_join_channel",
  "system_leave_channel",
  "system_add_to_channel",
  "system_remove_from_channel",
  "system_join_team",
  "system_leave_team",
  "system_add_to_team",
  "system_remove_from_team",
]);

export function isHiddenSystemPost(post: PostData): boolean {
  return !!post.post_type && HIDDEN_SYSTEM_POST_TYPES.has(post.post_type);
}

/**
 * Whether a post produces visible output in the main channel list.
 *
 * MessageList must agree with MessageItem here: a date separator is emitted
 * before the post it belongs to, so counting a post that renders nothing
 * leaves a bare date header with no messages under it.
 */
export function isRenderablePost(post: PostData | undefined): post is PostData {
  if (!post || post.delete_at > 0) return false;
  // Thread replies live in the thread panel, not the channel list.
  if (post.root_id) return false;
  return !isHiddenSystemPost(post);
}
