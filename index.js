// 💡 上でつくったHTMLファイルをテキストとして読み込む
import htmlContent from "./index.html";

export default {
  async fetch(request, env) {
    // 1. チャット画面（HTML）を表示する処理 (GET)
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. Groq APIと通信する処理 (POST)
    if (request.method === "POST") {
      try {
        const { message } = await request.json();

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: message }]
          })
        });

        const data = await groqResponse.json();
        const reply = data.choices[0].message.content;

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
};
