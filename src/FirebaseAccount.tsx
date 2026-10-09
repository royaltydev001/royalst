import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "./firebase/auth";
import { firebaseConfigured } from "./firebase/client";

type AuthMode = "sign-in" | "create-account";

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "auth/unauthorized-domain") return "This site domain is not authorized in Firebase Authentication settings.";
  if (code === "auth/operation-not-allowed") return "Google sign-in is not enabled for this Firebase project.";
  if (code === "auth/invalid-api-key" || code?.startsWith("auth/api-key-not-valid")) return "Firebase rejected this API key. Copy the apiKey from this project's Web app config into VITE_FIREBASE_API_KEY.";
  if (code === "auth/popup-blocked") return "The sign-in popup was blocked. Trying the redirect sign-in instead.";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") return "Email or password is incorrect.";
  if (code === "auth/email-already-in-use") return "An account already uses this email. Try signing in.";
  if (code === "auth/weak-password") return "Choose a stronger password (at least 6 characters).";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a while and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
  if (code === "auth/network-request-failed") return "Could not reach the account service. Check your connection.";
  if (code === "auth/operation-not-supported-in-this-environment") return "This browser blocks the sign-in method. Try a standard browser window with cookies enabled.";
  return code
    ? `Firebase sign-in failed (${code}). Check the enabled provider and authorized domain in Firebase Console.`
    : "Account request failed. Check your details and try again.";
}

export default function FirebaseAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    void getRedirectResult(auth).then((result) => {
      if (result) setNotice("Signed in with Google.");
    }).catch((error) => setNotice(friendlyError(error)));
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      window.dispatchEvent(new CustomEvent("royalstream:authchange", {
        detail: { uid: nextUser?.uid ?? "", email: nextUser?.email ?? "" },
      }));
      setPassword("");
      setCurrentPassword("");
      setNewPassword("");
    });
  }, []);

  if (!firebaseConfigured || !auth) {
    return <div className="profile-info-row"><strong>Firebase account</strong><p>Copy .env.example to .env.local and add your Firebase web app values to enable sign-in.</p></div>;
  }

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await action();
      setNotice(typeof result === "string" ? result : successMessage);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(
      async () => {
        if (mode === "sign-in") return signInWithEmailAndPassword(auth!, email.trim(), password);
        const credential = await createUserWithEmailAndPassword(auth!, email.trim(), password);
        try {
          await sendEmailVerification(credential.user);
          return "Account created. Check your email to verify your address.";
        } catch {
          return "Account created, but the verification email could not be sent. You can try again below.";
        }
      },
      mode === "create-account" ? "Account created." : "Signed in.",
    );
  };

  const signInWithGoogle = () => {
    setBusy(true);
    setNotice("");
    void signInWithPopup(auth!, new GoogleAuthProvider())
      .then(() => setNotice("Signed in with Google."))
      .catch((error) => {
        const code = (error as { code?: string })?.code;
        if (code === "auth/popup-blocked") {
          setNotice("The popup was blocked. Continuing with redirect sign-in…");
          return signInWithRedirect(auth!, new GoogleAuthProvider()).catch((redirectError) => setNotice(friendlyError(redirectError)));
        }
        setNotice(friendlyError(error));
      })
      .finally(() => setBusy(false));
  };

  const resetPassword = () => {
    if (!email.trim()) {
      setNotice("Enter your email address first.");
      return;
    }
    void run(() => sendPasswordResetEmail(auth!, email.trim()), "If an account exists for that email, a reset link has been sent.");
  };

  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !user.email) return;
    void run(async () => {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
    }, "Password updated.");
  };

  return (
    <div className="firebase-account">
      {user ? (
        <>
          <div className="profile-info-row"><strong>Signed in</strong><p>{user.displayName || user.email || "Google account"}</p></div>
          {user.email && !user.emailVerified && <div className="profile-info-row"><strong>Email not verified</strong><p>Verify your address to help protect account recovery.</p><button className="inline-link" type="button" disabled={busy} onClick={() => void run(() => sendEmailVerification(user), "Verification email sent.")}>Resend verification email</button></div>}
          <button className="secondary-cta" type="button" disabled={busy} onClick={() => void run(() => signOut(auth!), "Signed out.")}>Sign out</button>
          {user.providerData.some((provider) => provider.providerId === "password") && (
            <form className="profile-form firebase-password-form" onSubmit={changePassword}>
              <h3>Change password</h3>
              <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
              <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} required /></label>
              <button className="secondary-cta" type="submit" disabled={busy}>Update password</button>
            </form>
          )}
          <p className="profile-hint">Account deletion will be enabled after secure server-side cleanup is configured.</p>
        </>
      ) : (
        <>
          <div className="profile-card-heading"><div><h3>{mode === "create-account" ? "Create an account" : "Sign in"}</h3><p>Use email and password or your Google account.</p></div></div>
          <form className="profile-form firebase-auth-form" onSubmit={submitCredentials}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete={mode === "create-account" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "create-account" ? 6 : undefined} required /></label>
            <button className="primary-cta" type="submit" disabled={busy}>{mode === "create-account" ? "Create account" : "Sign in"}</button>
          </form>
          <div className="firebase-account-actions">
            <button className="inline-link" type="button" onClick={() => { setMode(mode === "sign-in" ? "create-account" : "sign-in"); setNotice(""); }}>{mode === "create-account" ? "Already have an account? Sign in" : "Create an account"}</button>
            {mode === "sign-in" && <button className="inline-link" type="button" disabled={busy} onClick={resetPassword}>Reset password</button>}
          </div>
          <button className="secondary-cta firebase-google-button" type="button" disabled={busy} onClick={signInWithGoogle}>Continue with Google</button>
        </>
      )}
      {notice && <p className="profile-notice" role="status" aria-live="polite">{notice}</p>}
    </div>
  );
}
