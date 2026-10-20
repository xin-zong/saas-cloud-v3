import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { api, send, DEMO_MODE, getToken, setToken, getSessionVersion, registerCapabilityRefresh, CAPABILITIES_CHANGED, BASE_URL } from "@/api/client"
import { DEMO_USERS, type AuthUser } from "./roles"
import { subscribeCapabilityEvents } from "./capabilityStream"

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
  const [permissionNotice, setPermissionNotice] = useState("")
  const [refreshFailure, setRefreshFailure] = useState("")
  const sessionGeneration = useRef(0)
  const refreshInFlight = useRef<{token: string; version: number; promise: Promise<void>; cancel: () => void} | null>(null)
  function normalize(next: AuthUser): AuthUser {
    // Legacy presentation components retain a neutral adapter value; navigation and
    // authorization are exclusively driven by the server tenant/menu capabilities.
    return {...next, role: next.role??'operator', organization: next.tenantName??next.organization??'', id: String(next.id), stationIds: next.stationIds.map(String), stationPermissions: next.stationPermissions ?? {}, organizationPermissions: {}}
  }
  useEffect(() => {
    let active = true
    let invalidationEpoch = 0
    const requests = new Set<AbortController>()
    const clear = () => { sessionGeneration.current++; for(const request of requests)request.abort(); setUser(null); setPendingUser(null); setChallengeId(""); setRefreshFailure(""); setRestoring(false) }
    const refresh = (invalidate = false): Promise<void> => {
      const token = getToken()
      if (!token) return Promise.resolve()
      if (invalidate) invalidationEpoch++
      if (refreshInFlight.current?.token === token && refreshInFlight.current.version === getSessionVersion()) return refreshInFlight.current.promise
      const controller = new AbortController()
      requests.add(controller)
      let timedOut = false
      const timeout = window.setTimeout(() => {timedOut = true; controller.abort()}, 30000)
      const generation = sessionGeneration.current
      const version = getSessionVersion()
      const isCurrentSession = () => active && getToken() === token && generation === sessionGeneration.current && version === getSessionVersion()
      const promise = (async () => {
        // Collapse a burst of completed writes before taking the next snapshot.
        // Only a newer invalidation can queue a trailing request; focus/timer calls
        // share this promise without invalidating it or causing an auth loop.
        do {
          await new Promise(resolve => window.setTimeout(resolve, 0))
          if (!isCurrentSession()) return
          const requestedEpoch = invalidationEpoch
          try {
            const next = await api<AuthUser>('/auth/me', {signal:controller.signal})
            if (!isCurrentSession()) return
            if (requestedEpoch !== invalidationEpoch) continue
            const normalized = normalize(next)
            setRefreshFailure("")
            setUser(current => JSON.stringify(current) === JSON.stringify(normalized) ? current : normalized)
          } catch (error) {
            if (!isCurrentSession()) return
            if (requestedEpoch !== invalidationEpoch) continue
            setRefreshFailure(timedOut ? '会话验证超时，请重试。' : error instanceof Error ? error.message : '当前权限刷新失败，请重试。')
            setUser(current => current ? {...current, menus: [], permissions: [], stationPermissions: {}, organizationPermissions: {}, stationIds: []} : null)
          }
          // Stop sharing the completed snapshot before promise cleanup runs.
          refreshInFlight.current = null
          return
        } while (isCurrentSession())
      })()
        .finally(() => { window.clearTimeout(timeout); requests.delete(controller); if (refreshInFlight.current?.promise === promise) refreshInFlight.current = null })
      refreshInFlight.current = {token, version, promise, cancel:() => controller.abort()}
      return promise
    }
    const changed = (event:Event) => {if(!(event instanceof CustomEvent&&event.detail?.silent))setPermissionNotice('权限已变化，已刷新当前权限。');void refresh(true)}
    const onFocus = () => { void refresh().finally(() => {if(active)setRestoring(false)}) }
    window.addEventListener('enerlution:unauthorized', clear)
    window.addEventListener(CAPABILITIES_CHANGED, changed)
    window.addEventListener('focus', onFocus)
    registerCapabilityRefresh(refresh)
    const timer = window.setInterval(onFocus, 60000)
    void refresh().finally(() => {if (active) setRestoring(false)})
    return () => {
      active = false
      for(const request of requests)request.abort()
      refreshInFlight.current = null
      registerCapabilityRefresh(null)
      window.clearInterval(timer)
      window.removeEventListener('enerlution:unauthorized', clear)
      window.removeEventListener(CAPABILITIES_CHANGED, changed)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  const capabilityToken = getToken()
  const capabilityVersion = getSessionVersion()
  useEffect(()=>{
    const token=capabilityToken;if(!user||!token||restoring)return
    const current=()=>getToken()===token&&getSessionVersion()===capabilityVersion
    return subscribeCapabilityEvents({baseUrl:BASE_URL,token,
      onInvalidate:()=>{if(current())window.dispatchEvent(new CustomEvent(CAPABILITIES_CHANGED,{detail:{silent:true}}))},
      onUnauthorized:()=>{if(current()){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'))}}
    })
  },[user?.id,capabilityToken,capabilityVersion,restoring])
  async function login(account: string, password: string, remember: boolean): Promise<LoginResult> {
    try {
      const result = await send<{requiresMfa: boolean; challengeId?: string; token?: string; user?: AuthUser}>('/auth/login', 'POST', {account: account.trim(), password})
      if (remember) localStorage.setItem(REMEMBERED_ACCOUNT_KEY, account.trim())
      else localStorage.removeItem(REMEMBERED_ACCOUNT_KEY)
      if (result.requiresMfa && result.challengeId) {
        setChallengeId(result.challengeId)
        setPendingUser({id: 'pending', name: account, account, role: 'operator', organization: '', stationIds: [], permissions: []})
      } else if (result.token && result.user) {refreshInFlight.current?.cancel(); setToken(result.token); setUser(normalize(result.user)); setRefreshFailure(''); setRestoring(false)}
      else throw new Error('登录响应不完整，请重新登录。')
      return {ok: true, requiresMfa: result.requiresMfa}
    } catch (error) {return {ok: false, message: error instanceof Error ? error.message : '登录失败'}}
  }
  async function verifyMfa(code: string): Promise<LoginResult> {
    try {
      const result = await send<{token: string; user: AuthUser}>('/auth/mfa', 'POST', {challengeId, code})
      refreshInFlight.current?.cancel(); setToken(result.token); setUser(normalize(result.user)); setPendingUser(null); setChallengeId(''); setRefreshFailure(''); setRestoring(false)
      return {ok: true, requiresMfa: false}
    } catch (error) {return {ok: false, message: error instanceof Error ? error.message : '验证失败'}}
  }
  async function logout() {
    const request = send('/auth/logout', 'POST')
    sessionGeneration.current++
    refreshInFlight.current?.cancel()
    setRefreshFailure(""); setRestoring(false)
    setToken(null); setUser(null); setPendingUser(null); setChallengeId(''); setPermissionNotice('')
    await request
  }
  return <AuthContext.Provider value={{user, pendingUser, rememberedAccount, login, verifyMfa, cancelMfa: () => {setPendingUser(null); setChallengeId('')}, logout: () => {void logout().catch(() => {})}}}>
    {permissionNotice && user && <div role="alert" className="api-inline-error">{permissionNotice}<button onClick={() => setPermissionNotice("")}>关闭提示</button></div>}
    {refreshFailure && <div role="alert" className="api-inline-error">{refreshFailure}<button onClick={()=>{setRestoring(Boolean(getToken()&&!user));window.dispatchEvent(new Event('focus'))}}>重试验证</button></div>}
    {restoring ? <div role="status" style={{padding: 40}}>正在验证登录会话…</div> : children}
  </AuthContext.Provider>
}
export function AuthProvider({children}: {children: ReactNode}) {
  return DEMO_MODE ? <DemoAuthProvider>{children}</DemoAuthProvider> : <ApiAuthProvider>{children}</ApiAuthProvider>
}
