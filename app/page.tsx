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

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Login
  const [showLogin, setShowLogin] = useState(true)
  const [password, setPassword] = useState('')

  // Add account
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ refreshToken: '', label: '' })

  // Selected account
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [gummies, setGummies] = useState<Gummie[]>([])
  const [credits, setCredits] = useState<number | null>(null)

  // Global settings
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)

  // Chat test
  const [chatInput, setChatInput] = useState('')
  const [chatOutput, setChatOutput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

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
    }
  }, [token])

  async function loadGlobalSettings() {
    try {
      const resp = await fetch('/api/v2/settings', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setGlobalSystemPrompt(data.systemPrompt || '')
    } catch {}
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
        setSuccess(`账号添加成功，已创建 ${data.gummiesCreated || 0} 个 Gummie`)
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
    loadCredits(account.id)
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

  async function loadCredits(accountId: string) {
    try {
      const resp = await fetch(`/api/v2/profile?accountId=${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      setCredits(data.credits ?? null)
    } catch {
      setCredits(null)
    }
  }

  async function deleteAllGummies(accountId: string) {
    if (!confirm('确定删除该账号下的所有 Gummie？此操作不可恢复！')) return
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`/api/v2/gummies?accountId=${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (resp.ok) {
        setSuccess(`已删除 ${data.deletedCount} 个 Gummie`)
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

  async function handleChat(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatLoading(true)
    setChatOutput('')
    try {
      const resp = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: chatInput }], stream: true }),
      })
      const reader = resp.body?.getReader()
      const decoder = new TextDecoder()
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) setChatOutput((prev) => prev + content)
            } catch {}
          }
        }
      }
    } catch {
      setChatOutput('错误：发送失败')
    } finally {
      setChatLoading(false)
    }
  }

  function handleLogout() {
    setToken('')
    localStorage.removeItem('admin_token')
    setShowLogin(true)
    setAccounts([])
    setSelectedAccount(null)
  }

  if (showLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6 text-center text-white">Gumloop 2API</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="管理密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white disabled:opacity-50">
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">Gumloop 2API</h1>
          <button onClick={handleLogout} className="text-sm text-zinc-400 hover:text-white">退出</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Alerts */}
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">×</button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-300 text-sm">
            {success}
          </div>
        )}

        {/* Global System Prompt */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">全局 System Prompt</h2>
            <button
              onClick={saveGlobalSettings}
              disabled={settingsLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
            >
              {settingsLoading ? '同步中...' : '保存并同步'}
            </button>
          </div>
          <textarea
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder="设置后将应用到所有启用账号的 Gummie..."
            rows={3}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Accounts */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <span className="font-medium">账号 ({accounts.length})</span>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
              >
                {showAddForm ? '取消' : '添加'}
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddAccount} className="p-3 border-b border-zinc-800 space-y-2">
                <input
                  type="text"
                  placeholder="标签（可选）"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
                />
                <textarea
                  placeholder="Refresh Token *"
                  value={formData.refreshToken}
                  onChange={(e) => setFormData({ ...formData, refreshToken: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
                <p className="text-xs text-zinc-500">添加后将自动为每个模型创建对应的 Gummie</p>
                <button type="submit" disabled={loading} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50">
                  {loading ? '添加中...' : '添加账号'}
                </button>
              </form>
            )}

            <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => selectAccount(account)}
                  className={`p-3 cursor-pointer hover:bg-zinc-800/50 ${selectedAccount?.id === account.id ? 'bg-zinc-800' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{account.label || account.id}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${account.enabled ? 'bg-green-600' : 'bg-zinc-700'}`}>
                      {account.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    模型: {account.gummies ? Object.keys(account.gummies).length : 0} 个
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccount(account.id, !account.enabled) }}
                      className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                    >
                      {account.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAccount(account.id) }}
                      className="px-2 py-1 bg-red-600/80 hover:bg-red-600 rounded text-xs"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && <div className="p-4 text-center text-zinc-500 text-sm">暂无账号</div>}
            </div>
          </div>

          {/* Account Details */}
          <div className="lg:col-span-2 space-y-4">
            {selectedAccount ? (
              <>
                {/* Credits */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-zinc-400">剩余额度</div>
                      <div className="text-2xl font-bold text-green-400">{credits ?? '-'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-400">账号</div>
                      <div className="font-medium">{selectedAccount.label || selectedAccount.id}</div>
                    </div>
                  </div>
                </div>

                {/* Model Gummies Mapping */}
                {selectedAccount.gummies && Object.keys(selectedAccount.gummies).length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
                    <div className="p-3 border-b border-zinc-800">
                      <span className="font-medium">模型映射 ({Object.keys(selectedAccount.gummies).length})</span>
                    </div>
                    <div className="divide-y divide-zinc-800 max-h-64 overflow-y-auto">
                      {Object.entries(selectedAccount.gummies).map(([model, gummieId]) => (
                        <div key={model} className="p-3 flex items-center justify-between">
                          <div className="font-medium text-sm">{model}</div>
                          <div className="text-xs text-zinc-500 font-mono">{gummieId.slice(0, 12)}...</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gummies from API */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                    <span className="font-medium">Gummie 列表 ({gummies.length})</span>
                    {gummies.length > 0 && (
                      <button
                        onClick={() => deleteAllGummies(selectedAccount.id)}
                        disabled={loading}
                        className="px-2 py-1 bg-red-600/80 hover:bg-red-600 rounded text-xs disabled:opacity-50"
                      >
                        删除全部
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-zinc-800 max-h-64 overflow-y-auto">
                    {gummies.map((g) => (
                      <div key={g.gummie_id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{g.name}</div>
                          <div className="text-xs text-zinc-500">{g.model_name}</div>
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">{g.gummie_id.slice(0, 12)}...</div>
                      </div>
                    ))}
                    {gummies.length === 0 && <div className="p-4 text-center text-zinc-500 text-sm">暂无 Gummie</div>}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                选择左侧账号查看详情
              </div>
            )}

            {/* Chat Test */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="font-medium mb-3">接口测试</h3>
              <form onSubmit={handleChat} className="space-y-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="输入测试消息..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
                />
                <button type="submit" disabled={chatLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50">
                  {chatLoading ? '发送中...' : '发送'}
                </button>
              </form>
              {chatOutput && (
                <div className="mt-3 p-3 bg-zinc-800 rounded text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {chatOutput}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
