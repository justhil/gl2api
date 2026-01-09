"""
Gumloop 对话测试 - 基于 HAR 抓包分析
"""

import asyncio
import json
import uuid
import sys
from datetime import datetime, timezone
import websockets

# 修复 Windows 控制台编码
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WS_URL = "wss://ws.gumloop.com/ws/gummies"

ID_TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImQ4Mjg5MmZhMzJlY2QxM2E0ZTBhZWZlNjI4ZGQ5YWFlM2FiYThlMWUiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoibWkgdHUiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSm9pSjNFMDMwbnE1TWVkLXhsbC1IZzZTVzBUNDRhdFZOWTlBNjJjcTIyY05QWTIzST1zOTYtYyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9hZ2VudGh1Yi1kZXYiLCJhdWQiOiJhZ2VudGh1Yi1kZXYiLCJhdXRoX3RpbWUiOjE3Njc4ODQ3MjYsInVzZXJfaWQiOiJCQTRrNmJsZGIxWmxydVpnaFcyUkViU3pkeXQyIiwic3ViIjoiQkE0azZibGRiMVpscnVaZ2hXMlJFYlN6ZHl0MiIsImlhdCI6MTc2Nzg5MjU0MiwiZXhwIjoxNzY3ODk2MTQyLCJlbWFpbCI6Im1pdHUyMzMzMzNAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMTcwNjc0NDI2MTExOTY3MjE1OTAiXSwiZW1haWwiOlsibWl0dTIzMzMzM0BnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.pY54DqVC7_nJj2rw1eFb6wTxS0uKd2zUKl9CHci0OKSdWQfrrzb3e1LzSalK4sSVgaDT0OM9KqfL6mp9ldmjEYuk5IHM92UFvk_goc4JUnKaavUGe19xcOSIQAiLgMbj1XY0H_BJpIiIKAqdldQRPZNsMnaTP3e_tux-9sBBKrqcByn7b7k_xDolBCaZgzwZSnSX33R0EGyIb97DexFoqBL782JfoATHVPyARb-cAiZk1GuJ8K1twtTo6SMfxpeFgH03zRFx2vp6oBIwPUHJYaFGAiC55vXpchUAQI2dFg-Tp2HbIjNXJjJ3Rg48pJZsRQWC9FVIjEIxcUfN6FgiJQ"

GUMMIE_ID = "53B4dqubPSZL9WDdjMi9MH"


def generate_id():
    """生成类似 Gumloop 的 ID"""
    return str(uuid.uuid4())


def get_timestamp():
    """获取 ISO 格式时间戳"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


async def test_chat():
    """测试对话"""
    print("连接 WebSocket...")

    try:
        async with websockets.connect(WS_URL) as ws:
            print("已连接")

            chat_id = generate_id()
            msg_id = f"msg_{generate_id()[:20]}"
            timestamp = get_timestamp()

            # 构造请求 - 参考 HAR 中的结构
            payload = {
                "type": "start",
                "payload": {
                    "id_token": ID_TOKEN,
                    "gummie_id": GUMMIE_ID,
                    "message": "hi",
                    "context": {
                        "type": "gummie",
                        "gummie_id": GUMMIE_ID,
                        "chat": {
                            "id": chat_id,
                            "msgs": [
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
                                    "timestamp": timestamp
                                },
                                {
                                    "id": msg_id,
                                    "timestamp": timestamp,
                                    "content": "hi",
                                    "role": "user"
                                }
                            ]
                        }
                    }
                }
            }

            print(f"发送消息: hi")
            print(f"Chat ID: {chat_id}")
            await ws.send(json.dumps(payload))

            # 接收流式响应
            reasoning_text = ""
            response_text = ""

            print("\n--- 响应 ---")
            while True:
                try:
                    data = await asyncio.wait_for(ws.recv(), timeout=60)
                    msg = json.loads(data)
                    msg_type = msg.get("type", "")

                    if msg_type == "step-start":
                        pass  # 静默

                    elif msg_type == "reasoning-start":
                        print("[思考] ", end="", flush=True)

                    elif msg_type == "reasoning-delta":
                        delta = msg.get("delta", "")
                        reasoning_text += delta
                        print(delta, end="", flush=True)

                    elif msg_type == "reasoning-end":
                        print()

                    elif msg_type == "text-delta":
                        delta = msg.get("delta", "")
                        response_text += delta
                        print(delta, end="", flush=True)

                    elif msg_type == "text-end":
                        pass

                    elif msg_type == "finish":
                        final = msg.get("final", False)
                        usage = msg.get("usage", {})
                        credits = msg.get("credits", 0)
                        print(f"\n--- 统计 ---")
                        print(f"Tokens: {usage.get('total_tokens', 0)}")
                        print(f"Credits: {credits}")
                        print(f"Final: {final}")
                        if final:
                            break

                    elif msg_type == "error":
                        error_msg = msg.get('errorMessage') or msg.get('error', str(msg))
                        print(f"\n[错误] {error_msg}")
                        print(f"完整错误: {json.dumps(msg, indent=2)}")
                        break

                    else:
                        print(f"\n[DEBUG {msg_type}] {json.dumps(msg, ensure_ascii=False)}")

                except asyncio.TimeoutError:
                    print("\n[超时]")
                    break

    except websockets.exceptions.InvalidStatusCode as e:
        print(f"连接失败: HTTP {e.status_code}")
    except Exception as e:
        print(f"错误: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_chat())
