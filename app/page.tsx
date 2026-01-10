'use client'

import { useState, useEffect } from 'react'

interface Account {
  id: string
  label?: string
  email?: string
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

interface ModelMapping {
  model: string
  accounts: Array<{
    accountId: string
    accountLabel: string
    gummieId: string
  }>
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
  const [reinitLoading, setReinitLoading] = useState(false)

  const [allCredits, setAllCredits] = useState<AccountCredits[]>([])
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [stats, setStats] = useState<Stats>({ day: [], week: [], month: [] })
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [modelMappings, setModelMappings] = useState<ModelMapping[]>([])
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [refreshingAccounts, setRefreshingAccounts] = useState(false)

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
      loadModelMappings()
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

  async function loadModelMappings() {
    setMappingsLoading(true)
    try {
      const resp = await fetch('/api/v2/model-mapping', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setModelMappings(data.mappings || [])
    } catch {}
    setMappingsLoading(false)
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
          label: account.label || account.email || account.id,
          credits: data.credits ?? null,
        })
      } catch {
        results.push({
          accountId: account.id,
          label: account.label || account.email || account.id,
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

  async function reinitAllGummies() {
    if (!confirm('确定重新初始化所有账号的 Agent？\n\n此操作将删除所有现有 Agent 并重新创建，可能需要较长时间。')) return
    setReinitLoading(true)
    setError('')
    setSuccess('')
    try {
      const resp = await fetch('/api/v2/reinit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (resp.ok) {
        setSuccess(`重新初始化完成：${data.successCount}/${data.accounts} 个账号成功，删除 ${data.totalDeleted} 个旧 Agent，创建 ${data.totalCreated} 个新 Agent`)
        loadAccounts()
        loadModelMappings()
        if (selectedAccount) loadGummies(selectedAccount.id)
        setTimeout(() => setSuccess(''), 8000)
      } else {
        setError(data.error || '重新初始化失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setReinitLoading(false)
    }
  }

  async function refreshAccountEmails() {
    setRefreshingAccounts(true)
    setError('')
    try {
      const resp = await fetch('/api/v2/accounts/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (resp.ok) {
        setSuccess(`已更新 ${data.updated} 个账号的邮箱信息`)
        loadAccounts()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '刷新失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setRefreshingAccounts(false)
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
        loadModelMappings()
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
        loadModelMappings()
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
        loadModelMappings()
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
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary p-4">
        <div className="w-full max-w-sm bg-surface rounded-lg shadow-card p-8">
          <h1 className="text-2xl font-semibold mb-2 text-center text-content">Gumloop 2API</h1>
          <p className="text-sm text-content-secondary text-center mb-6">管理控制台</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="输入管理密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-gray-200 rounded-lg text-content text-sm placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {error && <p className="text-error text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-primary hover:bg-primary-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary text-content">
      <header className="bg-surface border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-content">Gumloop 2API</h1>
          <button onClick={handleLogout} className="text-sm text-content-secondary hover:text-content transition-colors">退出登录</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-error text-sm flex justify-between items-center">
            {error}
            <button onClick={() => setError('')} className="text-red-400 hover:text-error ml-2">×</button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-success text-sm">
            {success}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="text-sm text-content-secondary mb-1">总额度</div>
            <div className="text-2xl font-semibold text-success">{totalCredits.toLocaleString()}</div>
          </div>
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="text-sm text-content-secondary mb-1">账号数</div>
            <div className="text-2xl font-semibold text-content">{accounts.length}</div>
          </div>
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="text-sm text-content-secondary mb-1">启用账号</div>
            <div className="text-2xl font-semibold text-content">{accounts.filter(a => a.enabled).length}</div>
          </div>
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="text-sm text-content-secondary mb-1 flex items-center gap-2">
              请求量
              <select
                value={statsPeriod}
                onChange={(e) => setStatsPeriod(e.target.value as 'day' | 'week' | 'month')}
                className="bg-transparent text-content-secondary text-sm border-none outline-none cursor-pointer"
              >
                <option value="day">今日</option>
                <option value="week">本周</option>
                <option value="month">本月</option>
              </select>
            </div>
            <div className="text-2xl font-semibold text-content">{totalRequests.toLocaleString()}</div>
          </div>
        </div>

        {/* Credits per Account */}
        {allCredits.length > 0 && (
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-content">各账号额度</span>
              <button
                onClick={loadAllCredits}
                disabled={creditsLoading}
                className="px-3 py-1.5 bg-surface-secondary hover:bg-gray-100 rounded-lg text-sm text-content-secondary disabled:opacity-50 transition-colors"
              >
                {creditsLoading ? '刷新中...' : '刷新'}
              </button>
            </div>
            <div className="flex flex-wrap gap-4">
              {allCredits.map((c) => (
                <div key={c.accountId} className="text-sm">
                  <span className="text-content-secondary">{c.label}:</span>
                  <span className="ml-1 text-success font-medium">{c.credits?.toLocaleString() ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model Stats */}
        {currentStats.length > 0 && (
          <div className="bg-surface rounded-lg shadow-card p-4">
            <div className="text-sm font-medium text-content mb-3">
              模型请求统计 ({statsPeriod === 'day' ? '今日' : statsPeriod === 'week' ? '本周' : '本月'})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {currentStats.sort((a, b) => b.count - a.count).map((s) => (
                <div key={s.model} className="p-3 bg-surface-secondary rounded-lg">
                  <div className="text-sm text-content truncate" title={s.model}>{s.model}</div>
                  <div className="text-lg font-semibold text-content">{s.count} 次</div>
                  <div className="text-sm text-content-tertiary">{((s.inputTokens + s.outputTokens) / 1000).toFixed(1)}k tokens</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Prompt */}
        <div className="bg-surface rounded-lg shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-content">全局 System Prompt</span>
            <div className="flex gap-2">
              <button
                onClick={reinitAllGummies}
                disabled={reinitLoading}
                className="px-3 py-1.5 bg-warning/10 hover:bg-warning/20 text-warning rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {reinitLoading ? '初始化中...' : '重新初始化全部 Agent'}
              </button>
              <button
                onClick={saveGlobalSettings}
                disabled={settingsLoading}
                className="px-3 py-1.5 bg-primary hover:bg-primary-light text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
              >
                {settingsLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <textarea
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder="设置后将应用到所有启用账号的 Agent..."
            rows={3}
            className="w-full px-3 py-2 bg-surface-secondary border border-gray-200 rounded-lg text-sm font-mono placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
          />
        </div>

        {/* Model-Gummie Mapping Table */}
        <div className="bg-surface rounded-lg shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-content">
              模型映射表 <span className="text-content-tertiary font-normal">({modelMappings.filter(m => m.accounts.length > 0).length}/{modelMappings.length} 可用)</span>
            </span>
            <button
              onClick={loadModelMappings}
              disabled={mappingsLoading}
              className="px-3 py-1.5 bg-surface-secondary hover:bg-gray-100 rounded-lg text-sm text-content-secondary disabled:opacity-50 transition-colors"
            >
              {mappingsLoading ? '刷新中...' : '刷新'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-secondary">
                <tr className="text-content-secondary text-left">
                  <th className="py-2 px-3 font-medium">模型</th>
                  <th className="py-2 px-3 font-medium">账号数</th>
                  <th className="py-2 px-3 font-medium">Gummie IDs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {modelMappings.map((m) => (
                  <tr key={m.model} className={m.accounts.length === 0 ? 'text-content-tertiary' : ''}>
                    <td className="py-2 px-3 font-mono truncate max-w-[200px]" title={m.model}>{m.model}</td>
                    <td className="py-2 px-3">
                      <span className={m.accounts.length > 0 ? 'text-success font-medium' : 'text-error'}>
                        {m.accounts.length}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {m.accounts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.accounts.map((a) => (
                            <span
                              key={a.gummieId}
                              className="px-2 py-0.5 bg-primary-lighter text-primary rounded text-xs"
                              title={`${a.accountLabel}: ${a.gummieId}`}
                            >
                              {a.accountLabel}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-content-tertiary">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Accounts List */}
          <div className="bg-surface rounded-lg shadow-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="text-sm font-medium text-content">账号 ({accounts.length})</span>
              <div className="flex gap-2">
                <button
                  onClick={refreshAccountEmails}
                  disabled={refreshingAccounts}
                  className="px-3 py-1.5 bg-surface-secondary hover:bg-gray-100 rounded-lg text-sm text-content-secondary disabled:opacity-50 transition-colors"
                >
                  {refreshingAccounts ? '刷新中...' : '刷新'}
                </button>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-3 py-1.5 bg-primary hover:bg-primary-light text-white rounded-lg text-sm transition-colors"
                >
                  {showAddForm ? '取消' : '添加'}
                </button>
              </div>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddAccount} className="p-4 border-b border-gray-100 space-y-3 bg-surface-secondary">
                <input
                  type="text"
                  placeholder="标签（可选）"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
                <textarea
                  placeholder="Refresh Token *"
                  value={formData.refreshToken}
                  onChange={(e) => setFormData({ ...formData, refreshToken: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                  required
                />
                <p className="text-xs text-content-tertiary">添加时会先删除账号内全部 Agent，再创建新的</p>
                <button type="submit" disabled={loading} className="w-full py-2 bg-success hover:bg-success/90 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  {loading ? '处理中...' : '添加账号'}
                </button>
              </form>
            )}

            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => selectAccount(account)}
                  className={`p-4 cursor-pointer hover:bg-surface-secondary transition-colors ${selectedAccount?.id === account.id ? 'bg-primary-lighter/50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-content truncate">{account.label || account.email || account.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${account.enabled ? 'bg-success/10 text-success' : 'bg-gray-100 text-content-tertiary'}`}>
                      {account.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="text-sm text-content-secondary mb-2">
                    {account.gummies ? Object.keys(account.gummies).length : 0} 个模型
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccount(account.id, !account.enabled) }}
                      className="px-2 py-1 bg-surface-secondary hover:bg-gray-100 rounded text-xs text-content-secondary transition-colors"
                    >
                      {account.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAccount(account.id) }}
                      className="px-2 py-1 bg-error/10 hover:bg-error/20 text-error rounded text-xs transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && <div className="p-6 text-center text-content-tertiary text-sm">暂无账号</div>}
            </div>
          </div>

          {/* Account Details */}
          <div className="lg:col-span-2">
            {selectedAccount ? (
              <div className="bg-surface rounded-lg shadow-card overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-content">
                    {selectedAccount.label || selectedAccount.email || selectedAccount.id} - Agent 列表 ({gummies.length})
                  </span>
                  {gummies.length > 0 && (
                    <button
                      onClick={() => deleteAllGummies(selectedAccount.id)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-error/10 hover:bg-error/20 text-error rounded-lg text-sm disabled:opacity-50 transition-colors"
                    >
                      删除全部
                    </button>
                  )}
                </div>
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {gummies.map((g) => (
                    <div key={g.gummie_id} className="p-4 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-content truncate">{g.name}</div>
                        <div className="text-sm text-content-secondary">{g.model_name}</div>
                      </div>
                      <button
                        onClick={() => deleteGummie(g.gummie_id)}
                        className="px-2 py-1 bg-error/10 hover:bg-error/20 text-error rounded text-xs ml-3 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {gummies.length === 0 && <div className="p-6 text-center text-content-tertiary text-sm">暂无 Agent</div>}
                </div>
              </div>
            ) : (
              <div className="bg-surface rounded-lg shadow-card p-8 text-center text-content-tertiary text-sm">
                选择左侧账号查看详情
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
