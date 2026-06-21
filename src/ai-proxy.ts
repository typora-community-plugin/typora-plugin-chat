
const DEFAULT_OPTIONS = {
  model: 'qwen3.6-35b-a3b',
  callback: (chunk: string) => console.log(chunk),
}

export async function getAIResponse(userMessage: string, options = DEFAULT_OPTIONS) {
  const url = 'http://192.168.137.1:11431/v1/chat/completions'
  // 注意安全性！
  const apiKey = 'sk-VUmff7VpOzbcDafyEeEwQOgcs8HPVQB39gPEF3OKMGdiAz9d'

  const requestData = {
    model: options.model,
    messages: [
      { role: 'user', content: userMessage }
    ],
    stream: true
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestData),
  })

  // 检查是否流式响应
  if (!response.body) {
    console.error("响应不包含body流。")
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  // 持续读取数据
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE响应分块，通常以\n\n分隔
    let parts = buffer.split("\n\n")
    buffer = parts.pop()! // 上一个块剩余部分继续拼接

    for (let part of parts) {
      if (part.startsWith("data: ")) {
        let jsonStr = part.replace("data: ", "")
        if (jsonStr === "[DONE]") {
          console.log("流式对话结束")
          return
        }
        try {
          let chunk = JSON.parse(jsonStr)
          if (chunk.choices?.[0]?.delta?.content) {
            // 输出或处理每一段 content
            options.callback(chunk.choices[0].delta.content)
          }
        } catch (e) {
          options.callback("\n[解析chunk失败]")
        }
      }
    }
  }
}
