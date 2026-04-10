import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomEmojiRenderer } from "./CustomEmojiRenderer";

// Mattermost interactive message attachment types
export interface PostActionOption {
  text: string;
  value: string;
}

export interface PostAction {
  id: string;
  name: string;
  type?: string; // "button" | "select"
  style?: string; // "default" | "primary" | "success" | "good" | "warning" | "danger"
  disabled?: boolean;
  options?: PostActionOption[];
  default_option?: string;
  cookie?: string;
  data_source?: string;
  integration?: {
    url: string;
    context?: Record<string, unknown>;
  };
}

export interface MessageAttachment {
  fallback?: string;
  color?: string;
  pretext?: string;
  author_name?: string;
  author_icon?: string;
  author_link?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  actions?: PostAction[];
}

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  postId: string;
  serverId: string;
  onPostUpdated?: () => void;
}

function ActionButton({
  action,
  postId,
  serverId,
  onPostUpdated,
}: {
  action: PostAction;
  postId: string;
  serverId: string;
  onPostUpdated?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState(action.default_option ?? "");
  const isSelect = action.type === "select";

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      await invoke("do_post_action", {
        serverId,
        postId,
        actionId: action.id,
        selectedOption: isSelect ? selectedOption : "",
        cookie: action.cookie ?? "",
      });
      onPostUpdated?.();
    } catch (e) {
      console.error("Failed to perform post action:", e);
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || action.disabled;
  const styleClass = action.style ? `attachment-action-btn--${action.style}` : "";

  if (isSelect && action.options && action.options.length > 0) {
    return (
      <div className="attachment-action-select-wrap">
        <select
          className="attachment-action-select"
          value={selectedOption}
          onChange={(e) => setSelectedOption(e.target.value)}
          disabled={isDisabled}
        >
          {action.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.text}
            </option>
          ))}
        </select>
        <button
          className={`attachment-action-btn attachment-action-btn--primary ${loading ? "loading" : ""}`}
          onClick={handleClick}
          disabled={isDisabled}
        >
          {loading ? "..." : action.name}
        </button>
      </div>
    );
  }

  return (
    <button
      className={`attachment-action-btn ${styleClass} ${loading ? "loading" : ""}`}
      onClick={handleClick}
      disabled={isDisabled}
    >
      {loading ? "..." : action.name}
    </button>
  );
}

function AttachmentField({ title, value, short }: { title: string; value: string; short?: boolean }) {
  return (
    <div className={`attachment-field ${short ? "short" : ""}`}>
      {title && <div className="attachment-field-title">{title}</div>}
      <div className="attachment-field-value">
        <CustomEmojiRenderer text={value} />
      </div>
    </div>
  );
}

function SingleAttachment({
  attachment,
  postId,
  serverId,
  onPostUpdated,
}: {
  attachment: MessageAttachment;
  postId: string;
  serverId: string;
  onPostUpdated?: () => void;
}) {
  const borderStyle = attachment.color
    ? { borderLeftColor: attachment.color.startsWith("#") ? attachment.color : `#${attachment.color}` }
    : undefined;

  const shortFields = attachment.fields?.filter((f) => f.short) ?? [];
  const longFields = attachment.fields?.filter((f) => !f.short) ?? [];

  return (
    <div className="message-attachment" style={borderStyle}>
      {attachment.pretext && (
        <div className="attachment-pretext">
          <CustomEmojiRenderer text={attachment.pretext} />
        </div>
      )}
      {(attachment.author_name || attachment.author_icon) && (
        <div className="attachment-author">
          {attachment.author_icon && (
            <img className="attachment-author-icon" src={attachment.author_icon} alt="" />
          )}
          {attachment.author_link ? (
            <a className="attachment-author-name" href={attachment.author_link} target="_blank" rel="noreferrer">
              {attachment.author_name}
            </a>
          ) : (
            <span className="attachment-author-name">{attachment.author_name}</span>
          )}
        </div>
      )}
      {attachment.title && (
        <div className="attachment-title">
          {attachment.title_link ? (
            <a href={attachment.title_link} target="_blank" rel="noreferrer">
              {attachment.title}
            </a>
          ) : (
            attachment.title
          )}
        </div>
      )}
      {attachment.text && (
        <div className="attachment-text">
          <CustomEmojiRenderer text={attachment.text} />
        </div>
      )}
      {attachment.image_url && (
        <img className="attachment-image" src={attachment.image_url} alt="" />
      )}
      {attachment.fields && attachment.fields.length > 0 && (
        <div className="attachment-fields">
          {/* Render long fields first, then short fields side-by-side */}
          {longFields.map((f, i) => (
            <AttachmentField key={i} title={f.title} value={f.value} short={false} />
          ))}
          {shortFields.length > 0 && (
            <div className="attachment-fields-short">
              {shortFields.map((f, i) => (
                <AttachmentField key={i} title={f.title} value={f.value} short={true} />
              ))}
            </div>
          )}
        </div>
      )}
      {attachment.actions && attachment.actions.length > 0 && (
        <div className="attachment-actions">
          {attachment.actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              postId={postId}
              serverId={serverId}
              onPostUpdated={onPostUpdated}
            />
          ))}
        </div>
      )}
      {(attachment.footer || attachment.thumb_url) && (
        <div className="attachment-footer">
          {attachment.footer_icon && (
            <img className="attachment-footer-icon" src={attachment.footer_icon} alt="" />
          )}
          {attachment.footer && <span className="attachment-footer-text">{attachment.footer}</span>}
          {attachment.thumb_url && (
            <img className="attachment-thumb" src={attachment.thumb_url} alt="" />
          )}
        </div>
      )}
    </div>
  );
}

export function MessageAttachments({ attachments, postId, serverId, onPostUpdated }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="message-attachments">
      {attachments.map((attachment, i) => (
        <SingleAttachment
          key={i}
          attachment={attachment}
          postId={postId}
          serverId={serverId}
          onPostUpdated={onPostUpdated}
        />
      ))}
    </div>
  );
}
