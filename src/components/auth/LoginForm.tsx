import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LoginFormProps {
  serverId: string;
  serverUrl: string;
  onLoginSuccess: (userId: string, username: string) => void;
  onBack: () => void;
}

interface LoginResponse {
  user: { id: string; username: string; email: string };
  teams: Array<{ id: string; display_name: string; name: string }>;
  token: string;
}

type AuthMethod = "password" | "token" | "gitlab";

export function LoginForm({ serverId, serverUrl, onLoginSuccess, onBack }: LoginFormProps) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Listen for SSO token emitted from Rust after SSO window auth completes
  useEffect(() => {
    const unlisten = listen<{ token: string }>("sso-token", async (event) => {
      const ssoToken = event.payload.token;
      if (!ssoToken) return;

      setLoading(true);
      setError("");
      try {
        const response = await invoke<LoginResponse>("complete_sso_login", {
          serverId,
          token: ssoToken,
        });
        onLoginSuccess(response.user.id, response.user.username);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [serverId, onLoginSuccess]);

  async function handleLogin() {
    if (authMethod === "token" && !token.trim()) return;
    if (authMethod === "password" && (!loginId.trim() || !password.trim())) return;
    if (authMethod === "gitlab") {
      handleSsoLogin("gitlab");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let response: LoginResponse;

      if (authMethod === "token") {
        response = await invoke<LoginResponse>("login_with_token", {
          serverId,
          token: token.trim(),
        });
      } else {
        response = await invoke<LoginResponse>("login", {
          serverId,
          loginId: loginId.trim(),
          password,
        });
      }

      onLoginSuccess(response.user.id, response.user.username);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSsoLogin(provider: string) {
    setLoading(true);
    setError("");

    try {
      // Opens an SSO window from Rust; token will arrive via "sso-token" event
      await invoke("open_sso_window", {
        serverId,
        provider,
      });
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <div className="login-form">
      <h2>Log In</h2>
      <p className="server-url-label">{serverUrl}</p>

      <div className="auth-toggle">
        <button
          className={authMethod === "password" ? "active" : ""}
          onClick={() => setAuthMethod("password")}
        >
          Password
        </button>
        <button
          className={authMethod === "token" ? "active" : ""}
          onClick={() => setAuthMethod("token")}
        >
          Access Token
        </button>
        <button
          className={authMethod === "gitlab" ? "active" : ""}
          onClick={() => setAuthMethod("gitlab")}
        >
          GitLab SSO
        </button>
      </div>

      {authMethod === "token" ? (
        <div className="form-group">
          <label htmlFor="token">Personal Access Token</label>
          <input
            id="token"
            type="password"
            placeholder="Enter your access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      ) : authMethod === "password" ? (
        <>
          <div className="form-group">
            <label htmlFor="login-id">Username or Email</label>
            <input
              id="login-id"
              type="text"
              placeholder="admin@example.com"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </>
      ) : (
        <div className="sso-info">
          <p className="muted">
            Click the button below to sign in via GitLab.
            A new window will open for authentication.
          </p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="button-row">
        <button onClick={onBack} className="secondary">
          Back
        </button>
        <button onClick={handleLogin} disabled={loading} className="primary">
          {loading ? "Signing in..." : authMethod === "gitlab" ? "Sign in with GitLab" : "Log In"}
        </button>
      </div>
    </div>
  );
}
