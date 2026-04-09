import { memo } from "react";
import type React from "react";
import { useUserAvatar } from "@/hooks/useUserAvatar";

interface UserAvatarProps {
  userId: string;
  username: string;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}

export const UserAvatar = memo(function UserAvatar({
  userId,
  username,
  size = 36,
  className = "",
  onClick,
}: UserAvatarProps) {
  const url = useUserAvatar(userId);
  const initials = (username || "?").charAt(0).toUpperCase();

  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (url) {
    return (
      <img
        src={url}
        alt={username}
        className={`user-avatar-img ${className}`}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className={`user-avatar-placeholder ${className}`}
      style={style}
      onClick={onClick}
    >
      {initials}
    </div>
  );
});
