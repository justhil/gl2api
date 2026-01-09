import type { Gummie, ChatHistory, UserProfile } from './types'

const API_BASE = 'https://api.gumloop.com'

function getHeaders(idToken: string, userId: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
    'x-auth-key': userId,
    'Referer': 'https://www.gumloop.com/',
    'Origin': 'https://www.gumloop.com',
  }
}

// ============ Gummie Management ============

export async function listGummies(idToken: string, userId: string): Promise<Gummie[]> {
  const resp = await fetch(`${API_BASE}/gummies?author_id=${userId}`, {
    headers: getHeaders(idToken, userId),
  })
  if (!resp.ok) throw new Error(`Failed to list gummies: ${resp.status}`)
  return resp.json()
}

export async function getGummie(gummieId: string, idToken: string, userId: string): Promise<Gummie | null> {
  const resp = await fetch(`${API_BASE}/gummies/${gummieId}`, {
    headers: getHeaders(idToken, userId),
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.gummie || null
}

export async function createGummie(
  idToken: string,
  userId: string,
  options: {
    name: string
    modelName?: string
    systemPrompt?: string
    description?: string
  }
): Promise<Gummie | null> {
  const resp = await fetch(`${API_BASE}/gummies`, {
    method: 'POST',
    headers: getHeaders(idToken, userId),
    body: JSON.stringify({
      name: options.name,
      model_name: options.modelName || 'claude-4.5-sonnet',
      author_id: userId,
      description: options.description || '',
      system_prompt: options.systemPrompt || '',
      tools: [],
      resources: [],
      is_active: true,
      metadata: {
        icon_url: 'icon-1',
        slack: {
          hide_pipeline_runner_results: false,
          stream_reasoning: false,
          thread_response_trigger: 'on_any_message',
        },
      },
    }),
  })
  if (!resp.ok) throw new Error(`Failed to create gummie: ${resp.status}`)
  const data = await resp.json()
  return data.gummie || null
}

export async function updateGummie(
  gummieId: string,
  idToken: string,
  userId: string,
  data: Partial<{
    name: string
    model_name: string
    system_prompt: string
    description: string
    is_active: boolean
    tools: unknown[]
  }>
): Promise<Gummie | null> {
  const resp = await fetch(`${API_BASE}/gummies/${gummieId}`, {
    method: 'PATCH',
    headers: getHeaders(idToken, userId),
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error(`Failed to update gummie: ${resp.status}`)
  const result = await resp.json()
  return result.gummie || null
}

export async function deleteGummie(gummieId: string, idToken: string, userId: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/gummies/${gummieId}`, {
    method: 'DELETE',
    headers: getHeaders(idToken, userId),
  })
  return resp.ok
}

// ============ Chat History ============

export async function getChatHistory(
  gummieId: string,
  idToken: string,
  userId: string,
  page = 1,
  pageSize = 20
): Promise<ChatHistory[]> {
  const resp = await fetch(
    `${API_BASE}/gummies/${gummieId}/chat?page=${page}&page_size=${pageSize}`,
    { headers: getHeaders(idToken, userId) }
  )
  if (!resp.ok) return []
  const data = await resp.json()
  return data.chats || []
}

// ============ User Profile ============

export async function getUserProfile(idToken: string, userId: string): Promise<UserProfile | null> {
  const resp = await fetch(`${API_BASE}/user_profile?user_id=${userId}`, {
    headers: getHeaders(idToken, userId),
  })
  if (!resp.ok) return null
  return resp.json()
}

export async function getCredits(idToken: string, userId: string): Promise<number> {
  const profile = await getUserProfile(idToken, userId)
  return profile?.credit_limit || 0
}
