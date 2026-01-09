'use client'

import { useState, useEffect } from 'react'

interface Account {
  id: string
  label?: string
  refreshToken?: string
  userId?: string
  gummieId?: string
  gummies?: Record<string, string>
  enabled: boolean
  createdAt: string
  errorCount: number
  successCount: number
}

interface Gummie {
  gummie_id: string
  name: string
  model_name: string
  system_prompt: string
  is_active: boolean
}

interface ModelStats {
  model: string
  count: number
  inputTokens: number
  outputTokens: number
}

interface Stats {
  day: ModelStats[]
  week: ModelStats[]
  month: ModelStats[]
}

interface AccountCredits {
  accountId: string
  label: string
  credits: number | null
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showLogin, setShowLogin] = useState(true)
  const [password, setPassword] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ refreshToken: '', label: '' })

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [gummies, setGummies] = useState<Gummie[]>([])

  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)

  const [allCredits, setAllCredits] = useState<AccountCredits[]>([])
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [stats, setStats] = useState<Stats>({ day: [], week: [], month: [] })
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month'>('day')

  useEffect(() => {
    const saved = localStorage.getItem('admin_token')
    if (saved) {
      setToken(saved)
      setShowLogin(false)
    }
  }, [])

  useEffect(() => {
    if (token) {
      loadAccounts()
      loadGlobalSettings()
      loadStats()
    }
  }, [token])

  useEffect(() => {
    if (token && accounts.length > 0) {
      loadAllCredits()
    }
  }, [token, accounts])

  async function loadGlobalSettings() {
    try {
      const resp = await fetch('/api/v2/settings', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setGlobalSystemPrompt(data.systemPrompt || '')
    } catch {}
  }

  async function loadStats() {
    try {
      const resp = await fetch('/api/v2/stats', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setStats(data)
    } catch {}
  }

  async function loadAllCredits() {
    setCreditsLoading(true)
    const results: AccountCredits[] = []
    for (const account of accounts) {
      try {
        const resp = await fetch(`/api/v2/profile?accountId=${account.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await resp.json()
        results.push({
          accountId: account.id,
          label: account.label || account.id,
          credits: data.credits ?? null,
        })
      } catch {
        results.push({
          accountId: account.id,
          label: account.label || account.id,
          credits: null,
        })
      }
    }
    setAllCredits(results)
    setCreditsLoading(false)
  }

  async function saveGlobalSettings() {
    setSettingsLoading(true)
    setError('')
    setSuccess('')
    try {
      const resp = await fetch('/api/v2/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ systemPrompt: globalSystemPrompt }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setSuccess(`已同步到 ${data.syncedCount}/${data.totalCount} 个 Gummie`)
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '保存失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setSettingsLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await resp.json()
      if (data.success) {
        setToken(password)
        localStorage.setItem('admin_token', password)
        setShowLogin(false)
      } else {
        setError(data.message || '登录失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function loadAccounts() {
    try {
      const resp = await fetch('/api/v2/accounts', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setAccounts(data.accounts || [])
    } catch {
      setError('加载账号失败')
    }
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/v2/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData, createGummies: true }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setShowAddForm(false)
        setFormData({ refreshToken: '', label: '' })
        loadAccounts()
        setSuccess(`账号添加成功，删除 ${data.gummiesDeleted || 0} 个旧 Agent，创建 ${data.gummiesCreated || 0} 个新 Agent`)
        setTimeout(() => setSuccess(''), 5000)
      } else {
        setError(data.error || '添加失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function toggleAccount(id: string, enabled: boolean) {
    try {
      await fetch(`/api/v2/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      })
      loadAccounts()
    } catch {
      setError('更新失败')
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm('确定删除此账号？')) return
    try {
      await fetch(`/api/v2/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      loadAccounts()
      if (selectedAccount?.id === id) setSelectedAccount(null)
    } catch {
      setError('删除失败')
    }
  }

  async function selectAccount(account: Account) {
    setSelectedAccount(account)
    loadGummies(account.id)
  }

  async function loadGummies(accountId: string) {
    try {
      const resp = await fetch(`/api/v2/gummies?accountId=${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      setGummies(data.gummies || [])
    } catch {
      setGummies([])
    }
  }

  async function deleteAllGummies(accountId: string) {
    if (!confirm('确定删除该账号下的所有 Agent？此操作不可恢复！')) return
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`/api/v2/gummies?accountId=${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (resp.ok) {
        setSuccess(`已删除 ${data.deletedCount} 个 Agent`)
        setTimeout(() => setSuccess(''), 3000)
        loadGummies(accountId)
        loadAccounts()
      } else {
        setError(data.error || '删除失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  async function deleteGummie(gummieId: string) {
    if (!selectedAccount) return
    if (!confirm('确定删除此 Agent？')) return
    try {
      const resp = await fetch(`/api/v2/gummies/${gummieId}?accountId=${selectedAccount.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resp.ok) {
        setSuccess('Agent 已删除')
        setTimeout(() => setSuccess(''), 2000)
        loadGummies(selectedAccount.id)
      } else {
        const data = await resp.json()
        setError(data.error || '删除失败')
      }
    } catch {
      setError('网络错误')
    }
  }

  function handleLogout() {
    setToken('')
    localStorage.removeItem('admin_token')
    setShowLogin(true)
    setAccounts([])
    setSelectedAccount(null)
  }

  const totalCredits = allCredits.reduce((sum, c) => sum + (c.credits || 0), 0)
  const currentStats = stats[statsPeriod]
  const totalRequests = currentStats.reduce((sum, s) => sum + s.count, 0)

  if (showLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-xs">
          <h1 className="text-xl font-bold mb-6 text-center text-white">Gumloop 2API</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              placeholder="管理密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-white disabled:opacity-50">
              {loading ? '...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      <div className="border-b border-zinc-900 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-sm font-medium text-white">Gumloop 2API</span>
          <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-zinc-300">退出</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {error && (
          <div className="p-2 bg-red-950/50 border border-red-900/50 rounded text-red-400 text-xs flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-400">×</button>
          </div>
        )}
        {success && (
          <div className="p-2 bg-green-950/50 border border-green-900/50 rounded text-green-400 text-xs">
            {success}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="text-xs text-zinc-500 mb-1">总额度</div>
            <div className="text-lg font-medium text-green-400">{totalCredits.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="text-xs text-zinc-500 mb-1">账号数</div>
            <div className="text-lg font-medium">{accounts.length}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="text-xs text-zinc-500 mb-1">启用账号</div>
            <div className="text-lg font-medium">{accounts.filter(a => a.enabled).length}</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="text-xs text-zinc-500 mb-1">
              请求量
              <select
                value={statsPeriod}
                onChange={(e) => setStatsPeriod(e.target.value as 'day' | 'week' | 'month')}
                className="ml-1 bg-transparent text-zinc-500 text-xs border-none outline-none cursor-pointer"
              >
                <option value="day">今日</option>
                <option value="week">本周</option>
                <option value="month">本月</option>
              </select>
            </div>
            <div className="text-lg font-medium">{totalRequests.toLocaleString()}</div>
          </div>
        </div>

        {/* Credits per Account */}
        {allCredits.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">各账号额度</span>
              <button
                onClick={loadAllCredits}
                disabled={creditsLoading}
                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs disabled:opacity-50"
              >
                {creditsLoading ? '刷新中...' : '刷新'}
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {allCredits.map((c) => (
                <div key={c.accountId} className="text-xs">
                  <span className="text-zinc-400">{c.label}:</span>
                  <span className="ml-1 text-green-400">{c.credits?.toLocaleString() ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model Stats */}
        {currentStats.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
            <div className="text-xs text-zinc-500 mb-2">模型请求统计 ({statsPeriod === 'day' ? '今日' : statsPeriod === 'week' ? '本周' : '本月'})</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {currentStats.sort((a, b) => b.count - a.count).map((s) => (
                <div key={s.model} className="text-xs p-2 bg-zinc-800/30 rounded">
                  <div className="text-zinc-400 truncate" title={s.model}>{s.model}</div>
                  <div className="text-zinc-200">{s.count} 次</div>
                  <div className="text-zinc-500">{((s.inputTokens + s.outputTokens) / 1000).toFixed(1)}k tokens</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Prompt */}
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">全局 System Prompt</span>
            <button
              onClick={saveGlobalSettings}
              disabled={settingsLoading}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs disabled:opacity-50"
            >
              {settingsLoading ? '...' : '保存'}
            </button>
          </div>
          <textarea
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder="设置后将应用到所有启用账号的 Agent..."
            rows={2}
            className="w-full px-2 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Accounts List */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded">
            <div className="flex items-center justify-between p-2 border-b border-zinc-800/50">
              <span className="text-xs text-zinc-400">账号 ({accounts.length})</span>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
              >
                {showAddForm ? '取消' : '添加'}
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddAccount} className="p-2 border-b border-zinc-800/50 space-y-2">
                <input
                  type="text"
                  placeholder="标签（可选）"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-2 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded text-xs focus:outline-none focus:border-zinc-600"
                />
                <textarea
                  placeholder="Refresh Token *"
                  value={formData.refreshToken}
                  onChange={(e) => setFormData({ ...formData, refreshToken: e.target.value })}
                  rows={2}
                  className="w-full px-2 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded text-xs font-mono focus:outline-none focus:border-zinc-600 resize-none"
                  required
                />
                <p className="text-xs text-zinc-600">添加时会先删除账号内全部 Agent，再创建新的</p>
                <button type="submit" disabled={loading} className="w-full py-1.5 bg-green-900/50 hover:bg-green-900/70 border border-green-800/50 rounded text-xs disabled:opacity-50">
                  {loading ? '处理中...' : '添加账号'}
                </button>
              </form>
            )}

            <div className="divide-y divide-zinc-800/50 max-h-80 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => selectAccount(account)}
                  className={`p-2 cursor-pointer hover:bg-zinc-800/30 ${selectedAccount?.id === account.id ? 'bg-zinc-800/50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{account.label || account.id}</span>
                    <span className={`px-1 py-0.5 rounded text-xs ${account.enabled ? 'bg-green-900/50 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {account.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600">
                    {account.gummies ? Object.keys(account.gummies).length : 0} 个模型
                  </div>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccount(account.id, !account.enabled) }}
                      className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
                    >
                      {account.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAccount(account.id) }}
                      className="px-1.5 py-0.5 bg-red-900/50 hover:bg-red-900/70 rounded text-xs"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && <div className="p-3 text-center text-zinc-600 text-xs">暂无账号</div>}
            </div>
          </div>

          {/* Account Details */}
          <div className="lg:col-span-2">
            {selectedAccount ? (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded">
                <div className="p-2 border-b border-zinc-800/50 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">
                    {selectedAccount.label || selectedAccount.id} - Agent 列表 ({gummies.length})
                  </span>
                  {gummies.length > 0 && (
                    <button
                      onClick={() => deleteAllGummies(selectedAccount.id)}
                      disabled={loading}
                      className="px-2 py-0.5 bg-red-900/50 hover:bg-red-900/70 rounded text-xs disabled:opacity-50"
                    >
                      删除全部
                    </button>
                  )}
                </div>
                <div className="divide-y divide-zinc-800/50 max-h-96 overflow-y-auto">
                  {gummies.map((g) => (
                    <div key={g.gummie_id} className="p-2 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{g.name}</div>
                        <div className="text-xs text-zinc-600">{g.model_name}</div>
                      </div>
                      <button
                        onClick={() => deleteGummie(g.gummie_id)}
                        className="px-1.5 py-0.5 bg-red-900/50 hover:bg-red-900/70 rounded text-xs ml-2"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {gummies.length === 0 && <div className="p-3 text-center text-zinc-600 text-xs">暂无 Agent</div>}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded p-6 text-center text-zinc-600 text-xs">
                选择左侧账号查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
