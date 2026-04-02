import { useUiStore } from "@/stores/uiStore";

interface PresenceDotProps {
  userId: string;
}

export function PresenceDot({ userId }: PresenceDotProps) {
  const status = useUiStore((s) => s.userStatuses[userId]);

  if (!status || status === "offline") return null;

  return <span className={`presence-dot ${status}`} title={status} />;
}
