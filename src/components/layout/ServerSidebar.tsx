import { useUiStore } from "@/stores/uiStore";

export function ServerSidebar() {
  const servers = useUiStore((s) => s.servers);
  const activeServerId = useUiStore((s) => s.activeServerId);

  return (
    <nav className="server-sidebar" aria-label="Servers">
      {servers.map((server) => (
        <button
          key={server.id}
          className={`server-icon ${activeServerId === server.id ? "active" : ""} ${server.connected ? "connected" : ""}`}
          onClick={() => {
            const store = useUiStore.getState();
            store.setActiveServerId(server.id);
            if (server.connected) {
              store.setCurrentView("main");
            } else {
              store.setCurrentView("login");
            }
          }}
          title={`${server.displayName}${server.username ? ` (${server.username})` : ""}`}
          aria-label={`Server: ${server.displayName}`}
          aria-current={activeServerId === server.id ? "true" : undefined}
        >
          {server.displayName.charAt(0).toUpperCase()}
        </button>
      ))}

      <button
        className="server-icon add-server"
        onClick={() => useUiStore.getState().setCurrentView("add-server")}
        title="Add Server"
        aria-label="Add Server"
      >
        +
      </button>
    </nav>
  );
}
