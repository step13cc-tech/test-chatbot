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
            model: "llama-3.1-8b-instant", // 💡 2026年現在、安定して動く新しいモデルに変更
            messages: [
              {
                role: "system",
                content: "あなたはユーザーの家族です。チャットアプリ風に短くテンポよく返すこと。"
              },
              { role: "user", content: message }
            ]
          })
        });

        // 💡 【ログ強化】Groqのステータスコードを記録
        console.log("Groq応答ステータス:", groqResponse.status);

        const data = await groqResponse.json();
        
        // 💡 【ログ強化】もしGroq側でエラーが起きていたら、その理由を詳しくログに残す
        if (!groqResponse.ok) {
          console.error("Groqエラー内容:", JSON.stringify(data));
          return new Response(JSON.stringify({ error: "Groq API側でエラーが発生しました" }), { status: groqResponse.status });
        }

        const reply = data.choices[0].message.content;

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        // 💡 【ログ強化】プログラム自体が失敗した場合の理由を記録
        console.error("Workers内部エラー:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
};
