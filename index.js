import htmlContent from "./index.html";

export default {
  async fetch(request, env) {
    // 1. チャット画面（HTML）を表示する処理 (GET)
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. 家族メンバー追加前のシンプルな通信処理 (POST)
    if (request.method === "POST") {
      try {
        // 画面からはメッセージテキストのみを受け取る（家族追加前の構造）
        const { message } = await request.json();

        // --- ① Groqでテキスト（セリフ）を生成 ---
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: "あなたはユーザーの家族です。チャットアプリ風に短くテンポよく返すこと。"
              },
              { role: "user", content: message }
            ]
          })
        });

        const groqData = await groqResponse.json();
        if (!groqResponse.ok) {
          console.error("Groqエラー:", JSON.stringify(groqData));
          return new Response(JSON.stringify({ error: "Groq API側でエラーが発生しました" }), { status: groqResponse.status });
        }
        
        const reply = groqData.choices[0].message.content;

        // --- ② Cartesiaでテキストを「音声」に変換（最新の正しい書き方） ---
        const cartesiaResponse = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CARTESIA_API_KEY}`, // X-API-KeyからBearer認証に変更
            "Cartesia-Version": "2024-06-10",                  // 必須ヘッダー
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model_id: "sonic",        // 多言語対応の標準モデル
            transcript: reply,        // 「text」ではなく「transcript」
            voice: {
              mode: "id",
              id: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e" // お母さん用の日本語ボイスID（適宜変更してください）
            },
            output_format: {
              container: "wav",
              encoding: "pcm_f32le",
              sample_rate: 44100
            },
            language: "ja"            // 日本語を綺麗に発音させるための指定
          })
        });

        // Cartesia側でエラーが起きた場合は原因をログに残す
        if (!cartesiaResponse.ok) {
          const errText = await cartesiaResponse.text();
          console.error("Cartesiaエラー内容:", errText);
          // 音声が失敗しても文字だけは表示できるようにフォールバック
          return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
        }

        // 音声のバイナリデータを取得し、Base64文字列に変換
        const audioBuffer = await cartesiaResponse.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

        // --- ③ テキストと音声（Base64）をセットにして画面に返す ---
        return new Response(JSON.stringify({ reply, audio: audioBase64 }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Workers内部エラー:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
};
