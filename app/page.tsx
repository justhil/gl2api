'use client'

import { useState, useEffect } from 'react'

interface Account {
  id: string
  label?: string
  refreshToken?: string
  userId?: string
  gummieId?: string
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

interface ChatHistory {
  interaction_id: string
  first_message: string
  created_ts: string
  creator_user_email: string
}

interface UserProfile {
  user_email: string
  subscription_tier: string
  credit_limit: number
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Login
  const [showLogin, setShowLogin] = useState(true)
  const [password, setPassword] = useState('')

  // Add account
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ refreshToken: '', label: '', gummieId: '' })

  // Selected account for details
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [gummies, setGummies] = useState<Gummie[]>([])
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [credits, setCredits] = useState<number | null>(null)

  // Gummie management
  const [showCreateGummie, setShowCreateGummie] = useState(false)
  const [newGummie, setNewGummie] = useState({ name: '', modelName: 'claude-sonnet-4-5', systemPrompt: '' })

  // Chat test
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatOutput, setChatOutput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Global settings
  const [showSettings, setShowSettings] = useState(false)
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState<'accounts' | 'gummies' | 'history' | 'profile'>('accounts')

  useEffect(() => {
    const saved = localStorage.getItem('admin_token')
    if (saved) {
      setToken(saved)
      setShowLogin(false)
    }
  }, [])

  useEffect(() => {
    if (token) loadAccounts()
  }, [token])

  useEffect(() => {
    if (token && showSettings) loadGlobalSettings()
  }, [token, showSettings])

  async function loadGlobalSettings() {
    try {
      const resp = await fetch('/api/v2/settings', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      setGlobalSystemPrompt(data.systemPrompt || '')
    } catch {
      // ignore
    }
  }

  async function saveGlobalSettings() {
    setSettingsLoading(true)
    setSettingsSaved(false)
    try {
      const resp = await fetch('/api/v2/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ systemPrompt: globalSystemPrompt }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setSettingsSaved(true)
        setTimeout(() => setSettingsSaved(false), 3000)
      } else {
        setError(data.error || 'Failed to save settings')
      }
    } catch {
      setError('Network error')
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
        setError(data.message || 'Login failed')
      }
    } catch {
      setError('Network error')
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
      setError('Failed to load accounts')
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
        body: JSON.stringify(formData),
      })
      const data = await resp.json()
      if (resp.ok) {
        setShowAddForm(false)
        setFormData({ refreshToken: '', label: '', gummieId: '' })
        loadAccounts()
      } else {
        setError(data.error || 'Failed to add account')
      }
    } catch {
      setError('Network error')
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
      setError('Failed to update account')
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete this account?')) return
    try {
      await fetch(`/api/v2/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      loadAccounts()
      if (selectedAccount?.id === id) setSelectedAccount(null)
    } catch {
      setError('Failed to delete account')
    }
  }

  async function selectAccount(account: Account) {
    setSelectedAccount(account)
    setActiveTab('gummies')
    await Promise.all([loadGummies(account.id), loadProfile(account.id)])
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

  async function loadChatHistory(accountId: string, gummieId: string) {
    try {
      const resp = await fetch(`/api/v2/chats?accountId=${accountId}&gummieId=${gummieId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      setChatHistory(data.chats || [])
    } catch {
      setChatHistory([])
    }
  }

  async function loadProfile(accountId: string) {
    try {
      const resp = await fetch(`/api/v2/profile?accountId=${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      setProfile(data.profile || null)
      setCredits(data.credits ?? null)
    } catch {
      setProfile(null)
      setCredits(null)
    }
  }

  async function handleCreateGummie(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAccount) return
    setLoading(true)
    try {
      const resp = await fetch('/api/v2/gummies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountId: selectedAccount.id, ...newGummie }),
      })
      if (resp.ok) {
        setShowCreateGummie(false)
        setNewGummie({ name: '', modelName: 'claude-sonnet-4-5', systemPrompt: '' })
        loadGummies(selectedAccount.id)
      } else {
        const data = await resp.json()
        setError(data.error || 'Failed to create gummie')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function deleteGummie(gummieId: string) {
    if (!selectedAccount || !confirm('Delete this gummie?')) return
    try {
      await fetch(`/api/v2/gummies/${gummieId}?accountId=${selectedAccount.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      loadGummies(selectedAccount.id)
    } catch {
      setError('Failed to delete gummie')
    }
  }

  async function setDefaultGummie(gummieId: string) {
    if (!selectedAccount) return
    try {
      await fetch(`/api/v2/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gummieId }),
      })
      loadAccounts()
      setSelectedAccount({ ...selectedAccount, gummieId })
    } catch {
      setError('Failed to set default gummie')
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
      setChatOutput('Error: Failed to send message')
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6 text-center">Gumloop 2API</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-50">
              {loading ? 'Loading...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Gumloop 2API</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(!showSettings)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">
              {showSettings ? 'Hide Settings' : 'Settings'}
            </button>
            <button onClick={() => setShowChat(!showChat)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">
              {showChat ? 'Hide Chat' : 'Test Chat'}
            </button>
            <button onClick={handleLogout} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-300">×</button>
          </div>
        )}

        {/* Global Settings */}
        {showSettings && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Global System Prompt</h2>
            <p className="text-sm text-zinc-400 mb-4">
              Set a global system prompt that will be applied to all enabled accounts&apos; Gummies.
              Each API request creates a new conversation to prevent context pollution.
            </p>
            <textarea
              value={globalSystemPrompt}
              onChange={(e) => setGlobalSystemPrompt(e.target.value)}
              placeholder="Enter global system prompt..."
              rows={6}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={saveGlobalSettings}
                disabled={settingsLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-50"
              >
                {settingsLoading ? 'Saving...' : 'Save & Sync to All Gummies'}
              </button>
              {settingsSaved && <span className="text-green-500 text-sm">Saved and synced successfully!</span>}
            </div>
          </div>
        )}

        {/* Chat Test */}
        {showChat && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Chat Test</h2>
            <form onSubmit={handleChat} className="space-y-4">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Enter your message..."
                rows={3}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded focus:outline-none focus:border-blue-500"
              />
              <button type="submit" disabled={chatLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-50">
                {chatLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
            {chatOutput && <div className="mt-4 p-4 bg-zinc-800 rounded whitespace-pre-wrap">{chatOutput}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Accounts List */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Accounts ({accounts.length})</h2>
              <button onClick={() => setShowAddForm(!showAddForm)} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm">
                {showAddForm ? 'Cancel' : 'Add'}
              </button>
            </div>

            {showAddForm && (
              <div className="mb-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                <form onSubmit={handleAddAccount} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                  <textarea
                    placeholder="Refresh Token *"
                    value={formData.refreshToken}
                    onChange={(e) => setFormData({ ...formData, refreshToken: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Default Gummie ID (optional)"
                    value={formData.gummieId}
                    onChange={(e) => setFormData({ ...formData, gummieId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button type="submit" disabled={loading} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50">
                    {loading ? 'Adding...' : 'Add Account'}
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => selectAccount(account)}
                  className={`p-3 bg-zinc-900 border rounded-lg cursor-pointer transition ${
                    selectedAccount?.id === account.id ? 'border-blue-500' : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium truncate">{account.label || account.id}</div>
                    <span className={`px-2 py-0.5 rounded text-xs ${account.enabled ? 'bg-green-600' : 'bg-zinc-700'}`}>
                      {account.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Gummie: {account.gummieId || 'Not set'}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccount(account.id, !account.enabled) }}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
                    >
                      Toggle
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAccount(account.id) }}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && <div className="text-center text-zinc-500 py-8">No accounts</div>}
            </div>
          </div>

          {/* Account Details */}
          <div className="lg:col-span-2">
            {selectedAccount ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
                {/* Tabs */}
                <div className="flex border-b border-zinc-800">
                  {(['gummies', 'history', 'profile'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab)
                        if (tab === 'history' && selectedAccount.gummieId) {
                          loadChatHistory(selectedAccount.id, selectedAccount.gummieId)
                        }
                      }}
                      className={`px-4 py-3 text-sm font-medium ${
                        activeTab === tab ? 'border-b-2 border-blue-500 text-blue-500' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {tab === 'gummies' ? 'Gummies' : tab === 'history' ? 'Chat History' : 'Profile & Credits'}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {/* Gummies Tab */}
                  {activeTab === 'gummies' && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Gummies ({gummies.length})</h3>
                        <button onClick={() => setShowCreateGummie(!showCreateGummie)} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm">
                          {showCreateGummie ? 'Cancel' : 'Create'}
                        </button>
                      </div>

                      {showCreateGummie && (
                        <form onSubmit={handleCreateGummie} className="mb-4 p-3 bg-zinc-800 rounded space-y-3">
                          <input
                            type="text"
                            placeholder="Name *"
                            value={newGummie.name}
                            onChange={(e) => setNewGummie({ ...newGummie, name: e.target.value })}
                            className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                            required
                          />
                          <select
                            value={newGummie.modelName}
                            onChange={(e) => setNewGummie({ ...newGummie, modelName: e.target.value })}
                            className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                          >
                            <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                            <option value="claude-opus-4-5">claude-opus-4-5</option>
                            <option value="claude-haiku-4-5">claude-haiku-4-5</option>
                          </select>
                          <textarea
                            placeholder="System Prompt (optional)"
                            value={newGummie.systemPrompt}
                            onChange={(e) => setNewGummie({ ...newGummie, systemPrompt: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm"
                          />
                          <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50">
                            Create
                          </button>
                        </form>
                      )}

                      <div className="space-y-2">
                        {gummies.map((g) => (
                          <div key={g.gummie_id} className="p-3 bg-zinc-800 rounded flex items-center justify-between">
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {g.name}
                                {selectedAccount.gummieId === g.gummie_id && (
                                  <span className="px-2 py-0.5 bg-blue-600 rounded text-xs">Default</span>
                                )}
                              </div>
                              <div className="text-xs text-zinc-500">{g.model_name} | {g.gummie_id}</div>
                            </div>
                            <div className="flex gap-2">
                              {selectedAccount.gummieId !== g.gummie_id && (
                                <button onClick={() => setDefaultGummie(g.gummie_id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">
                                  Set Default
                                </button>
                              )}
                              <button
                                onClick={() => { loadChatHistory(selectedAccount.id, g.gummie_id); setActiveTab('history') }}
                                className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                              >
                                History
                              </button>
                              <button onClick={() => deleteGummie(g.gummie_id)} className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs">
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        {gummies.length === 0 && <div className="text-center text-zinc-500 py-4">No gummies</div>}
                      </div>
                    </div>
                  )}

                  {/* Chat History Tab */}
                  {activeTab === 'history' && (
                    <div>
                      <h3 className="font-semibold mb-4">Chat History</h3>
                      <div className="space-y-2">
                        {chatHistory.map((chat) => (
                          <div key={chat.interaction_id} className="p-3 bg-zinc-800 rounded">
                            <div className="text-sm truncate">{chat.first_message}</div>
                            <div className="text-xs text-zinc-500 mt-1">
                              {new Date(chat.created_ts).toLocaleString()} | {chat.creator_user_email}
                            </div>
                          </div>
                        ))}
                        {chatHistory.length === 0 && <div className="text-center text-zinc-500 py-4">No chat history</div>}
                      </div>
                    </div>
                  )}

                  {/* Profile Tab */}
                  {activeTab === 'profile' && (
                    <div>
                      <h3 className="font-semibold mb-4">Profile & Credits</h3>
                      {profile ? (
                        <div className="space-y-3">
                          <div className="p-4 bg-zinc-800 rounded">
                            <div className="text-3xl font-bold text-green-500">{credits ?? 0}</div>
                            <div className="text-sm text-zinc-400">Credits Remaining</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-zinc-800 rounded">
                              <div className="text-xs text-zinc-500">Email</div>
                              <div className="text-sm">{profile.user_email}</div>
                            </div>
                            <div className="p-3 bg-zinc-800 rounded">
                              <div className="text-xs text-zinc-500">Subscription</div>
                              <div className="text-sm capitalize">{profile.subscription_tier}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-zinc-500 py-4">Loading profile...</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                Select an account to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
