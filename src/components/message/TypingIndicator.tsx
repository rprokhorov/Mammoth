import { useUiStore } from "@/stores/uiStore";

interface TypingIndicatorProps {
  channelId: string;
}

export function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const typingUsers = useUiStore((s) => s.typingUsers[channelId]);
  const users = useUiStore((s) => s.users);

  if (!typingUsers || typingUsers.length === 0) {
    return <div className="typing-indicator" />;
  }

  const names = typingUsers.map((uid) => {
    const u = users[uid];
    return u ? u.nickname || u.username : "Someone";
  });

  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = "Several people are typing...";
  }

  return <div className="typing-indicator">{text}</div>;
}
