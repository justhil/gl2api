"""
Gumloop 对话客户端
基于 HAR 抓包分析实现
"""

import asyncio
import json
import uuid
import sys
import httpx
from datetime import datetime, timezone
import websockets

# 导入配置
from config import (
    WS_URL, API_BASE_URL, FIREBASE_API_KEY,
    ID_TOKEN, REFRESH_TOKEN, USER_ID,
    GUMMIES, DEFAULT_GUMMIE_ID, AVAILABLE_MODELS, SLACK_CONFIG,
    get_headers
)

# 修复 Windows 控制台编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 全局 token（可被刷新）
_current_token = ID_TOKEN


def get_timestamp():
    """获取 ISO 格式时间戳"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def generate_id():
    """生成 UUID"""
    return str(uuid.uuid4())


async def refresh_token() -> bool:
    """使用 refresh_token 刷新 id_token"""
    global _current_token

    url = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}"
    data = {
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, data=data)
        if resp.status_code == 200:
            result = resp.json()
            _current_token = result["id_token"]
            print("[Token 已刷新]")
            return True
        else:
            print(f"[刷新失败] {resp.status_code}: {resp.text}")
            return False


async def list_gummies_from_api() -> list:
    """从 API 获取用户的所有 Gummie"""
    url = f"{API_BASE_URL}/gummies?author_id={USER_ID}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=get_headers(_current_token))
        if resp.status_code == 200:
            return resp.json()
    return []


async def get_gummie(gummie_id: str) -> dict:
    """获取单个 Gummie 详情"""
    url = f"{API_BASE_URL}/gummies/{gummie_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=get_headers(_current_token))
        if resp.status_code == 200:
            return resp.json().get("gummie", {})
    return {}


async def update_gummie(gummie_id: str, data: dict) -> dict:
    """
    更新 Gummie 配置

    可更新字段:
    - name: 名称
    - model_name: 模型名称
    - system_prompt: 系统提示词
    - description: 描述
    - is_active: 是否激活
    - tools: 工具列表
    - resources: 资源列表
    - metadata: 元数据（包含 icon_url, slack 配置等）
    """
    url = f"{API_BASE_URL}/gummies/{gummie_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.patch(url, headers=get_headers(_current_token), json=data)
        if resp.status_code == 200:
            return resp.json().get("gummie", {})
        else:
            print(f"[更新失败] {resp.status_code}: {resp.text}")
    return {}


async def delete_gummie(gummie_id: str) -> bool:
    """删除 Gummie"""
    url = f"{API_BASE_URL}/gummies/{gummie_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, headers=get_headers(_current_token))
        if resp.status_code in [200, 204]:
            return True
        else:
            print(f"[删除失败] {resp.status_code}: {resp.text}")
    return False


async def get_chat_history(gummie_id: str, page: int = 1, page_size: int = 20) -> list:
    """获取聊天历史列表"""
    url = f"{API_BASE_URL}/gummies/{gummie_id}/chat?page={page}&page_size={page_size}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=get_headers(_current_token))
        if resp.status_code == 200:
            return resp.json().get("chats", [])
    return []


async def get_chat_detail(gummie_id: str, interaction_id: str) -> dict:
    """获取单个聊天的详细消息"""
    # 尝试从 interaction API 获取详情
    url = f"{API_BASE_URL}/gummies/{gummie_id}/interactions/{interaction_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=get_headers(_current_token))
        if resp.status_code == 200:
            return resp.json()
    return {}


async def get_user_profile() -> dict:
    """获取用户配置信息（包含配额）"""
    url = f"{API_BASE_URL}/user_profile?user_id={USER_ID}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=get_headers(_current_token))
        if resp.status_code == 200:
            return resp.json()
    return {}


async def get_credits() -> int:
    """获取剩余配额"""
    profile = await get_user_profile()
    return profile.get("credit_limit", 0)


async def create_gummie(name: str, model_name: str = "claude-sonnet-4-5", system_prompt: str = "") -> dict:
    """创建新的 Gummie"""
    url = f"{API_BASE_URL}/gummies"
    data = {
        "name": name,
        "model_name": model_name,
        "author_id": USER_ID,
        "description": "",
        "system_prompt": system_prompt,
        "tools": [],
        "resources": [],
        "is_active": True,
        "metadata": {
            "icon_url": "icon-1",
            "slack": SLACK_CONFIG
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=get_headers(_current_token), json=data)
        if resp.status_code in [200, 201]:
            return resp.json().get("gummie", {})
        else:
            print(f"[创建失败] {resp.status_code}: {resp.text}")
    return {}


class GumloopChat:
    def __init__(self, gummie_id: str = DEFAULT_GUMMIE_ID, chat_id: str = None):
        self.gummie_id = gummie_id
        self.chat_id = chat_id or generate_id()
        self.gummie_info = GUMMIES.get(gummie_id, {})
        self.interaction_id = None  # 用于标识历史对话
        self.messages = [
            {
                "id": "GUMMIE_INITIAL_MESSAGE",
                "role": "assistant",
                "parts": [
                    {
                        "id": "GUMMIE_INITIAL_MESSAGE_PART",
                        "type": "text",
                        "text": "Hey, I'm your custom Gumloop Agent! Let me know how I can assist."
                    }
                ],
                "timestamp": get_timestamp()
            }
        ]

    @classmethod
    async def from_history(cls, gummie_id: str, interaction_id: str) -> "GumloopChat":
        """从历史对话创建实例"""
        chat = cls(gummie_id)
        chat.interaction_id = interaction_id
        chat.chat_id = interaction_id  # 使用 interaction_id 作为 chat_id 继续对话

        # 尝试获取历史消息
        detail = await get_chat_detail(gummie_id, interaction_id)
        if detail and detail.get("messages"):
            chat.messages = detail["messages"]

        return chat

    def add_user_message(self, content: str) -> dict:
        msg = {
            "id": f"msg_{generate_id()[:20]}",
            "timestamp": get_timestamp(),
            "content": content,
            "role": "user"
        }
        self.messages.append(msg)
        return msg

    def add_assistant_message(self, msg_id: str, text: str, reasoning: str = None):
        parts = []
        if reasoning:
            parts.append({
                "id": f"part_{generate_id()[:20]}",
                "type": "reasoning",
                "timestamp": get_timestamp(),
                "reasoning": reasoning
            })
        parts.append({
            "id": f"part_{generate_id()[:20]}",
            "type": "text",
            "timestamp": get_timestamp(),
            "text": text
        })
        msg = {
            "id": msg_id,
            "timestamp": get_timestamp(),
            "role": "assistant",
            "parts": parts
        }
        self.messages.append(msg)

    def build_payload(self, message: str) -> dict:
        self.add_user_message(message)
        return {
            "type": "start",
            "payload": {
                "id_token": _current_token,
                "gummie_id": self.gummie_id,
                "message": message,
                "context": {
                    "type": "gummie",
                    "gummie_id": self.gummie_id,
                    "chat": {
                        "id": self.chat_id,
                        "msgs": self.messages
                    }
                }
            }
        }

    async def send(self, message: str, show_reasoning: bool = True) -> str:
        try:
            async with websockets.connect(WS_URL) as ws:
                payload = self.build_payload(message)
                await ws.send(json.dumps(payload))

                reasoning_text = ""
                response_text = ""
                msg_id = None

                while True:
                    try:
                        data = await asyncio.wait_for(ws.recv(), timeout=120)
                        msg = json.loads(data)
                        msg_type = msg.get("type", "")

                        if msg_type == "reasoning-start" and show_reasoning:
                            print("[思考] ", end="", flush=True)
                        elif msg_type == "reasoning-delta":
                            delta = msg.get("delta", "")
                            reasoning_text += delta
                            if show_reasoning:
                                print(delta, end="", flush=True)
                        elif msg_type == "reasoning-end" and show_reasoning:
                            print()
                        elif msg_type == "text-start":
                            msg_id = msg.get("id")
                        elif msg_type == "text-delta":
                            delta = msg.get("delta", "")
                            response_text += delta
                            print(delta, end="", flush=True)
                        elif msg_type == "text-end":
                            print()
                        elif msg_type == "finish":
                            if msg.get("final"):
                                usage = msg.get("usage", {})
                                print(f"[Tokens: {usage.get('total_tokens', 0)}, Credits: {msg.get('credits', 0)}]")
                                break
                        elif msg_type == "error":
                            error = msg.get('errorMessage') or msg.get('error')
                            print(f"\n[错误] {error}")
                            break

                    except asyncio.TimeoutError:
                        print("\n[超时]")
                        break

                if response_text and msg_id:
                    self.add_assistant_message(msg_id, response_text, reasoning_text if reasoning_text else None)

                return response_text

        except Exception as e:
            print(f"[错误] {type(e).__name__}: {e}")
            return ""


def print_help():
    """打印帮助信息"""
    print("""
命令列表:
  exit/quit/q     - 退出程序
  new             - 新建对话（保持当前 Gummie）
  refresh         - 刷新 Token

  list            - 列出所有 Gummie
  switch <id>     - 切换到指定 Gummie
  info            - 显示当前 Gummie 详情

  history         - 查看聊天历史
  load <id>       - 加载历史对话继续聊天

  credits         - 查看剩余配额
  profile         - 查看用户信息

  model           - 设置模型
  prompt          - 设置系统提示词
  name            - 设置当前 Gummie 名称
  rename          - 重命名指定 Gummie

  create          - 创建新 Gummie
  delete          - 删除 Gummie

  help/?          - 显示此帮助
""")


def print_models():
    """打印可用模型"""
    print("\n可用模型:")
    for i, model in enumerate(AVAILABLE_MODELS, 1):
        print(f"  {i}. {model}")


async def print_user_profile():
    """打印用户信息"""
    profile = await get_user_profile()
    if not profile:
        print("[获取用户信息失败]")
        return

    print(f"\n=== 用户信息 ===")
    print(f"用户ID: {profile.get('user_id')}")
    print(f"邮箱: {profile.get('user_email')}")
    print(f"姓名: {profile.get('first_name')} {profile.get('last_name')}")
    print(f"订阅: {profile.get('subscription_tier')}")
    print(f"剩余配额: {profile.get('credit_limit')} credits")
    print(f"低配额警告: {profile.get('is_low_credit_warning_enabled')} (阈值: {profile.get('low_credit_warning_threshold_percent')}%)")
    print(f"时区: {profile.get('timezone')}")
    print(f"最后活动: {profile.get('latest_activity_ts')}")


async def print_chat_history(gummie_id: str):
    """打印聊天历史列表"""
    chats = await get_chat_history(gummie_id)
    if not chats:
        print("\n[没有聊天历史]")
        return

    print(f"\n=== 聊天历史 ({len(chats)} 条) ===")
    for i, chat in enumerate(chats, 1):
        iid = chat.get("interaction_id", "")
        first_msg = chat.get("first_message", "")[:40]
        created = chat.get("created_ts", "")[:10]
        chat_type = chat.get("type", "chat")
        print(f"  {i}. [{iid[:12]}...] {first_msg}{'...' if len(chat.get('first_message', '')) > 40 else ''}")
        print(f"     类型: {chat_type} | 时间: {created}")


async def load_chat_from_history(gummie_id: str, identifier: str) -> "GumloopChat":
    """
    从历史加载对话
    identifier 可以是序号(1,2,3...)或 interaction_id
    """
    chats = await get_chat_history(gummie_id)
    if not chats:
        print("[没有聊天历史]")
        return None

    interaction_id = None

    # 尝试作为序号解析
    if identifier.isdigit():
        idx = int(identifier) - 1
        if 0 <= idx < len(chats):
            interaction_id = chats[idx].get("interaction_id")
        else:
            print(f"[无效的序号，有效范围: 1-{len(chats)}]")
            return None
    else:
        # 作为 interaction_id 匹配（支持部分匹配）
        for chat in chats:
            iid = chat.get("interaction_id", "")
            if iid == identifier or iid.startswith(identifier):
                interaction_id = iid
                break

        if not interaction_id:
            print(f"[未找到匹配的对话: {identifier}]")
            return None

    # 加载对话
    loaded_chat = await GumloopChat.from_history(gummie_id, interaction_id)
    return loaded_chat


async def print_gummies():
    """打印可用的 Gummie 列表"""
    gummies = await list_gummies_from_api()
    if gummies:
        print("\n可用的 Gummie:")
        for g in gummies:
            print(f"  [{g['gummie_id']}]")
            print(f"    名称: {g['name']}")
            print(f"    模型: {g['model_name']}")
            prompt = g.get('system_prompt', '')
            if prompt:
                print(f"    提示词: {prompt[:50]}{'...' if len(prompt) > 50 else ''}")
    else:
        print("\n本地 Gummie 配置:")
        for gid, info in GUMMIES.items():
            print(f"  [{gid}] {info['name']} ({info['model']})")


async def print_gummie_info(gummie_id: str):
    """打印 Gummie 详细信息"""
    info = await get_gummie(gummie_id)
    if info:
        print(f"\n=== Gummie 详情 ===")
        print(f"ID: {info.get('gummie_id')}")
        print(f"名称: {info.get('name')}")
        print(f"模型: {info.get('model_name')}")
        print(f"描述: {info.get('description') or '(无)'}")
        print(f"系统提示词: {info.get('system_prompt') or '(无)'}")
        print(f"激活状态: {info.get('is_active')}")
        print(f"创建时间: {info.get('created_ts')}")
        print(f"工具: {info.get('tools') or '(无)'}")
        print(f"资源: {info.get('resources') or '(无)'}")
    else:
        print("[获取失败]")


async def set_model(gummie_id: str) -> bool:
    """设置模型"""
    print_models()
    choice = input("\n选择模型 (输入编号或模型名): ").strip()

    # 支持编号或名称
    if choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(AVAILABLE_MODELS):
            model_name = AVAILABLE_MODELS[idx]
        else:
            print("[无效的编号]")
            return False
    elif choice in AVAILABLE_MODELS:
        model_name = choice
    else:
        print("[无效的模型名]")
        return False

    result = await update_gummie(gummie_id, {"model_name": model_name})
    if result:
        print(f"[模型已设置为: {model_name}]")
        return True
    return False


async def set_system_prompt(gummie_id: str) -> bool:
    """设置系统提示词"""
    print("\n输入系统提示词 (输入空行结束，输入 'clear' 清空):")
    lines = []
    while True:
        try:
            line = input()
            if line == "":
                break
            lines.append(line)
        except EOFError:
            break

    prompt = "\n".join(lines)
    if prompt.lower() == "clear":
        prompt = ""

    result = await update_gummie(gummie_id, {"system_prompt": prompt})
    if result:
        if prompt:
            print(f"[系统提示词已设置: {prompt[:50]}{'...' if len(prompt) > 50 else ''}]")
        else:
            print("[系统提示词已清空]")
        return True
    return False


async def set_name(gummie_id: str) -> bool:
    """设置当前 Gummie 名称"""
    name = input("输入新名称: ").strip()
    if not name:
        print("[名称不能为空]")
        return False

    result = await update_gummie(gummie_id, {"name": name})
    if result:
        print(f"[名称已设置为: {name}]")
        return True
    return False


async def rename_gummie_interactive() -> bool:
    """交互式重命名指定 Gummie"""
    await print_gummies()
    gid = input("\n输入要重命名的 Gummie ID: ").strip()

    if not gid:
        print("[已取消]")
        return False

    info = await get_gummie(gid)
    if not info:
        print("[无效的 Gummie ID]")
        return False

    print(f"当前名称: {info.get('name')}")
    new_name = input("输入新名称: ").strip()
    if not new_name:
        print("[名称不能为空]")
        return False

    result = await update_gummie(gid, {"name": new_name})
    if result:
        print(f"[已重命名: {info.get('name')} -> {new_name}]")
        return True
    return False


async def create_new_gummie() -> str:
    """创建新 Gummie"""
    name = input("输入名称: ").strip()
    if not name:
        print("[名称不能为空]")
        return ""

    print_models()
    choice = input("选择模型 (编号，默认 1): ").strip() or "1"
    if choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(AVAILABLE_MODELS):
            model_name = AVAILABLE_MODELS[idx]
        else:
            model_name = AVAILABLE_MODELS[0]
    else:
        model_name = AVAILABLE_MODELS[0]

    print("输入系统提示词 (可选，输入空行结束):")
    lines = []
    while True:
        try:
            line = input()
            if line == "":
                break
            lines.append(line)
        except EOFError:
            break
    prompt = "\n".join(lines)

    result = await create_gummie(name, model_name, prompt)
    if result:
        gid = result.get("gummie_id")
        print(f"[Gummie 已创建: {gid}]")
        return gid
    return ""


async def delete_gummie_interactive(current_gummie_id: str) -> str:
    """交互式删除 Gummie，返回新的 gummie_id（如果当前被删除）"""
    await print_gummies()
    gid = input("\n输入要删除的 Gummie ID: ").strip()

    if not gid:
        print("[已取消]")
        return current_gummie_id

    # 获取信息确认
    info = await get_gummie(gid)
    if not info:
        print("[无效的 Gummie ID]")
        return current_gummie_id

    confirm = input(f"确认删除 '{info.get('name')}' ({gid})? (y/N): ").strip().lower()
    if confirm != 'y':
        print("[已取消]")
        return current_gummie_id

    if await delete_gummie(gid):
        print(f"[已删除: {info.get('name')}]")
        # 如果删除的是当前 Gummie，切换到默认
        if gid == current_gummie_id:
            print("[当前 Gummie 已被删除，请切换到其他 Gummie]")
            return ""
    return current_gummie_id


async def main():
    print("=" * 50)
    print("Gumloop 对话客户端")
    print("输入 'help' 或 '?' 查看命令列表")
    print("=" * 50)

    # 刷新 token
    await refresh_token()

    chat = GumloopChat()

    # 获取当前 Gummie 信息
    info = await get_gummie(chat.gummie_id)
    if info:
        print(f"\n当前 Gummie: {info.get('name')} ({info.get('model_name')})")
        if info.get('system_prompt'):
            print(f"系统提示词: {info.get('system_prompt')[:50]}...")
    else:
        print(f"\n当前 Gummie: {chat.gummie_id}")

    while True:
        try:
            user_input = input("\n你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见!")
            break

        if not user_input:
            continue

        cmd = user_input.lower().split()
        cmd_name = cmd[0] if cmd else ""

        # 退出
        if cmd_name in ["exit", "quit", "q"]:
            print("再见!")
            break

        # 帮助
        if cmd_name in ["help", "?"]:
            print_help()
            continue

        # 新建对话
        if cmd_name == "new":
            chat = GumloopChat(chat.gummie_id)
            print("[新对话已创建]")
            continue

        # 刷新 token
        if cmd_name == "refresh":
            await refresh_token()
            continue

        # 列出 Gummie
        if cmd_name == "list":
            await print_gummies()
            continue

        # 切换 Gummie
        if cmd_name == "switch":
            if len(cmd) > 1:
                gid = cmd[1]
            else:
                await print_gummies()
                gid = input("\n输入 Gummie ID: ").strip()

            if gid:
                info = await get_gummie(gid)
                if info:
                    chat = GumloopChat(gid)
                    print(f"[已切换到: {info.get('name')} ({info.get('model_name')})]")
                else:
                    print("[无效的 Gummie ID]")
            continue

        # 显示当前 Gummie 信息
        if cmd_name == "info":
            await print_gummie_info(chat.gummie_id)
            continue

        # 查看聊天历史
        if cmd_name == "history":
            await print_chat_history(chat.gummie_id)
            continue

        # 加载历史对话
        if cmd_name == "load":
            if len(cmd) > 1:
                identifier = cmd[1]
            else:
                await print_chat_history(chat.gummie_id)
                identifier = input("\n输入序号或对话ID: ").strip()

            if identifier:
                loaded = await load_chat_from_history(chat.gummie_id, identifier)
                if loaded:
                    chat = loaded
                    msg_count = len([m for m in chat.messages if m.get("role") in ["user", "assistant"]])
                    print(f"[已加载对话: {chat.chat_id[:12]}... ({msg_count} 条消息)]")
            continue

        # 查看剩余配额
        if cmd_name == "credits":
            credits = await get_credits()
            print(f"\n剩余配额: {credits} credits")
            continue

        # 查看用户信息
        if cmd_name == "profile":
            await print_user_profile()
            continue

        # 设置模型
        if cmd_name == "model":
            await set_model(chat.gummie_id)
            continue

        # 设置系统提示词
        if cmd_name == "prompt":
            await set_system_prompt(chat.gummie_id)
            continue

        # 设置名称
        if cmd_name == "name":
            await set_name(chat.gummie_id)
            continue

        # 重命名指定 Gummie
        if cmd_name == "rename":
            await rename_gummie_interactive()
            continue

        # 创建新 Gummie
        if cmd_name == "create":
            gid = await create_new_gummie()
            if gid:
                chat = GumloopChat(gid)
            continue

        # 删除 Gummie
        if cmd_name == "delete":
            new_gid = await delete_gummie_interactive(chat.gummie_id)
            if new_gid == "":
                # 当前 Gummie 被删除，需要切换
                gummies = await list_gummies_from_api()
                if gummies:
                    chat = GumloopChat(gummies[0]['gummie_id'])
                    print(f"[已自动切换到: {gummies[0]['name']}]")
                else:
                    print("[没有可用的 Gummie，请创建一个]")
            continue

        # 发送消息
        print("\nAI: ", end="")
        await chat.send(user_input)


if __name__ == "__main__":
    asyncio.run(main())
