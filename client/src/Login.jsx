import React, { useState } from "react";

export default function Login({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      onAuth(data.token, data.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>📊 Base Serenia</h1>
        <p className="auth-sub">{mode === "login" ? "Sign in to your sheets" : "Create your account"}</p>

        <label>Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />

        <label>Password</label>
        <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />

        {error && <div className="auth-error">{error}</div>}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <p className="auth-toggle">
          {mode === "login" ? (
            <>No account? <a onClick={() => setMode("register")}>Register</a></>
          ) : (
            <>Already have an account? <a onClick={() => setMode("login")}>Sign in</a></>
          )}
        </p>
      </form>
    </div>
  );
}
