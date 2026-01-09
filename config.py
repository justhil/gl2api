"""
Gumloop 配置模块
从 HAR 抓包中提取的配置信息
"""

# ============ API 配置 ============
WS_URL = "wss://ws.gumloop.com/ws/gummies"
API_BASE_URL = "https://api.gumloop.com"
FIREBASE_API_KEY = "AIzaSyCYuXqbJ0YBNltoGS4-7Y6Hozrra8KKmaE"

# ============ 认证信息 ============
# Firebase JWT Token（有效期约1小时）
ID_TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImQ4Mjg5MmZhMzJlY2QxM2E0ZTBhZWZlNjI4ZGQ5YWFlM2FiYThlMWUiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoibWkgdHUiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSm9pSjNFMDMwbnE1TWVkLXhsbC1IZzZTVzBUNDRhdFZOWTlBNjJjcTIyY05QWTIzST1zOTYtYyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9hZ2VudGh1Yi1kZXYiLCJhdWQiOiJhZ2VudGh1Yi1kZXYiLCJhdXRoX3RpbWUiOjE3Njc4ODQ3MjYsInVzZXJfaWQiOiJCQTRrNmJsZGIxWmxydVpnaFcyUkViU3pkeXQyIiwic3ViIjoiQkE0azZibGRiMVpscnVaZ2hXMlJFYlN6ZHl0MiIsImlhdCI6MTc2Nzg5Mzk0MSwiZXhwIjoxNzY3ODk3NTQxLCJlbWFpbCI6Im1pdHUyMzMzMzNAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMTcwNjc0NDI2MTExOTY3MjE1OTAiXSwiZW1haWwiOlsibWl0dTIzMzMzM0BnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.mo2nf4baa2796S4kaQoODaGBu6el6rX8O3SQh1UCKVouLbBu_07-B_uMgx6TQiBtvG8XAKjp_mjzbVqB7FUz4-Xdsur8YVl29dpF-qTe6Z3JJkyXgOhaRw3pLsdOacdxuLiEONpibnI02elgwE3XxjGzkx65Ihg4Qz1zZvSKfxKf-Q9yYBlN4U-WmL2u7LwJB9zZWpyeT7OKNFk1hxCLlmS7NnUQqtxdg3nSbDHxo-Zc2wTYmEuFO50NEiTop0okji1Asnv2_Q03QH919-WvbUI4wa-Nry0PfKMW6uz0IOGPCvPUFQsj-pmHHlmNByxRxQuo74oRC_qKmdCyz21qqw"

# Refresh Token（长期有效，用于刷新 ID_TOKEN）
REFRESH_TOKEN = "AMf-vBwG0z9Hflu4pcDHyJVd3GO_HWzmmrdzQhN3SaqyqHNRPfQsP-mRCsebwL_2aiMPzKcrmEgX8qEba1RwoqBK7SnhaF03oNsDf267Cv56uGwX0V3D937GsiJka6AwcDwfPfQ2B2U0vN38s8BZcHT9ovPvIcRir5QtT47QcUz19WkdZMbt2UQf3VIpDPWL8YcmZ2WSiWrReyZlBQejEwl5wAkuwqjFxlpjkj6ojdowleuZ1AzS1XmKdBFFMmDBp-XdV0lxAYAr2_w6nH-oqJH9jDo5e6m67ZM5-FcLOqoCY4NvpSepmubU6nNHAsl5arHoWJfD7ZZaNh7z0yQ1MgRLrzHef4hVVb61Whmmktc7gCI5-mjonai4iYQTwU6SQSV3Mq2nXSsuUhFIIvidAtMnufjpkJuHH7s6VLmK6hW0z-MXBKFQYEc"

# 用户信息
USER_ID = "BA4k6bldb1ZlruZghW2REbSzdyt2"
USER_EMAIL = "mitu233333@gmail.com"
USER_NAME = "mi tu"

# ============ Gummie (Agent) 配置 ============
# 可用的 Gummie 列表
GUMMIES = {
    "hsZHPuT2pnE86ZDPvqNR1e": {
        "name": "Reliable Handler",
        "model": "claude-opus-4-5",
        "system_prompt": "你是一个猫娘",
        "icon": "icon-1"
    },
    "kPHMqE6dvgrhBAisw4zi91": {
        "name": "Expert Bolt",
        "model": "claude-sonnet-4-5",
        "system_prompt": "",
        "icon": "icon-1"
    },
    "53B4dqubPSZL9WDdjMi9MH": {
        "name": "Turbo Operator",
        "model": "claude-opus-4-1",
        "system_prompt": "",
        "icon": "icon-2"
    }
}

# 默认 Gummie
DEFAULT_GUMMIE_ID = "hsZHPuT2pnE86ZDPvqNR1e"

# ============ 可用模型 ============
AVAILABLE_MODELS = [
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-sonnet-4-5",
]

# ============ Slack 集成配置 ============
SLACK_CONFIG = {
    "hide_pipeline_runner_results": False,
    "stream_reasoning": False,
    "thread_response_trigger": "on_any_message"
}

# ============ 请求头模板 ============
def get_headers(token: str = None) -> dict:
    """获取 API 请求头"""
    return {
        "Authorization": f"Bearer {token or ID_TOKEN}",
        "Content-Type": "application/json",
        "x-auth-key": USER_ID,
        "Referer": "https://www.gumloop.com/",
        "Origin": "https://www.gumloop.com"
    }
