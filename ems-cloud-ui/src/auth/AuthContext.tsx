import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api, send, DEMO_MODE, getToken, setToken } from "@/api/client"
import { DEMO_USERS, type AuthUser } from "./roles"

const SESSION_KEY = "enerlution-auth-session-v1"
const REMEMBERED_ACCOUNT_KEY = "enerlution-auth-account-v1"
export const DEMO_MFA_CODE = "246810"

type LoginResult =
  | { ok: true; requiresMfa: boolean }
  | { ok: false; message: string }

type AuthContextValue = {
  user: AuthUser | null
  pendingUser: AuthUser | null
  rememberedAccount: string
  login: (account: string, password: string, remember: boolean) => LoginResult | Promise<LoginResult>
  verifyMfa: (code: string) => LoginResult | Promise<LoginResult>
  cancelMfa: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function publicUser(user: (typeof DEMO_USERS)[number]): AuthUser {
  const { password: _password, requiresMfa: _requiresMfa, ...safeUser } = user
  return safeUser
}

function loadSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId?: string }
    const match = DEMO_USERS.find((user) => user.id === parsed.userId)
    return match ? publicUser(match) : null
  } catch {
    return null
  }
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSession)
  const [pendingUserId, setPendingUserId] = useState("")
  const rememberedAccount = (() => {
    try {
      return localStorage.getItem(REMEMBERED_ACCOUNT_KEY) ?? ""
    } catch {
      return ""
    }
  })()
  const pendingSource = DEMO_USERS.find((item) => item.id === pendingUserId)
  const pendingUser = pendingSource ? publicUser(pendingSource) : null

  function persist(nextUser: AuthUser) {
    setUser(nextUser)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: nextUser.id }))
  }

  function login(account: string, password: string, remember: boolean): LoginResult {
    const normalized = account.trim().toLowerCase()
    const match = DEMO_USERS.find(
      (item) => item.account.toLowerCase() === normalized,
    )
    if (!match || match.password !== password) {
      return { ok: false, message: "账号或密码不正确，请检查后重试。" }
    }
    try {
      if (remember) localStorage.setItem(REMEMBERED_ACCOUNT_KEY, match.account)
      else localStorage.removeItem(REMEMBERED_ACCOUNT_KEY)
    } catch {
      // Remembering the account is optional and must not block sign-in.
    }
    if (match.requiresMfa) {
      setPendingUserId(match.id)
      return { ok: true, requiresMfa: true }
    }
    persist(publicUser(match))
    return { ok: true, requiresMfa: false }
  }

  function verifyMfa(code: string): LoginResult {
    if (!pendingSource) {
      return { ok: false, message: "验证会话已失效，请重新登录。" }
    }
    if (code.trim() !== DEMO_MFA_CODE) {
      return { ok: false, message: "验证码不正确，请重新输入。" }
    }
    persist(publicUser(pendingSource))
    setPendingUserId("")
    return { ok: true, requiresMfa: false }
  }

  function cancelMfa() {
    setPendingUserId("")
  }

  function logout() {
    setUser(null)
    setPendingUserId("")
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // The in-memory session is already cleared.
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      pendingUser,
      rememberedAccount,
      login,
      verifyMfa,
      cancelMfa,
      logout,
    }),
    [pendingUser, rememberedAccount, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}


function ApiAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null)
  const [challengeId, setChallengeId] = useState("")
  const [restoring, setRestoring] = useState(Boolean(getToken()))
  const rememberedAccount = localStorage.getItem(REMEMBERED_ACCOUNT_KEY) ?? ""
  function normalize(next: AuthUser): AuthUser {
    return {...next, id: String(next.id), stationIds: next.stationIds.map(String)}
  }
  useEffect(() => {
    const controller = new AbortController()
    const clear = () => { setUser(null); setPendingUser(null); setChallengeId("") }
    window.addEventListener('enerlution:unauthorized', clear)
    if (getToken()) api<AuthUser>('/auth/me', {signal: controller.signal})
      .then(next => { if (!controller.signal.aborted) setUser(normalize(next)) })
      .catch(() => { if (!controller.signal.aborted) {setToken(null); clear()} })
      .finally(() => {if (!controller.signal.aborted) setRestoring(false)})
    return () => {controller.abort(); window.removeEventListener('enerlution:unauthorized', clear)}
  }, [])
  async function login(account: string, password: string, remember: boolean): Promise<LoginResult> {
    try {
      const result = await send<{requiresMfa: boolean; challengeId?: string; token?: string; user?: AuthUser}>('/auth/login', 'POST', {account: account.trim(), password})
      if (remember) localStorage.setItem(REMEMBERED_ACCOUNT_KEY, account.trim())
      else localStorage.removeItem(REMEMBERED_ACCOUNT_KEY)
      if (result.requiresMfa && result.challengeId) {
        setChallengeId(result.challengeId)
        setPendingUser({id: 'pending', name: account, account, role: 'operator', organization: '', stationIds: [], permissions: []})
      } else if (result.token && result.user) {setToken(result.token); setUser(normalize(result.user))}
      else throw new Error('登录响应不完整，请重新登录。')
      return {ok: true, requiresMfa: result.requiresMfa}
    } catch (error) {return {ok: false, message: error instanceof Error ? error.message : '登录失败'}}
  }
  async function verifyMfa(code: string): Promise<LoginResult> {
    try {
      const result = await send<{token: string; user: AuthUser}>('/auth/mfa', 'POST', {challengeId, code})
      setToken(result.token); setUser(normalize(result.user)); setPendingUser(null); setChallengeId('')
      return {ok: true, requiresMfa: false}
    } catch (error) {return {ok: false, message: error instanceof Error ? error.message : '验证失败'}}
  }
  async function logout() {
    try {await send('/auth/logout', 'POST')} finally {setToken(null); setUser(null); setPendingUser(null); setChallengeId('')}
  }
  return <AuthContext.Provider value={{user, pendingUser, rememberedAccount, login, verifyMfa, cancelMfa: () => {setPendingUser(null); setChallengeId('')}, logout: () => {void logout().catch(() => {})}}}>
    {restoring ? <div role="status" style={{padding: 40}}>正在验证登录会话…</div> : children}
  </AuthContext.Provider>
}
export function AuthProvider({children}: {children: ReactNode}) {
  return DEMO_MODE ? <DemoAuthProvider>{children}</DemoAuthProvider> : <ApiAuthProvider>{children}</ApiAuthProvider>
}
