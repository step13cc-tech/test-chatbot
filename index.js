import htmlContent from "./index.html";

// 💡 対策：大きな音声データでもパンク（Maximum call stack size）しないように小分けにして変換する関数
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 65536; // 64KBずつに細かく分けて安全に処理します
  for (let i = 0; i < len; i += chunkSize) {
    const subArray = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, subArray);
  }
  return btoa(binary);
}

export default {
  async fetch(request, env) {
    // 1. チャット画面（HTML）を表示する処理 (GET)
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. 通信処理 (POST)
    if (request.method === "POST") {
      try {
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
          return new Response(JSON.stringify({ error: "Groqエラー" }), { status: 500 });
        }
        
        const reply = groqData.choices[0].message.content;

        // --- ② Cartesiaでテキストを「音声」に変換 ---
        const cartesiaResponse = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": env.CARTESIA_API_KEY,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model_id: "sonic-latest",
            transcript: reply,
            voice: {
              mode: "id",
              id: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e" // ご指定のボイスIDを挿入しています
            },
            output_format: {
              container: "wav",
              encoding: "pcm_s16le",
              sample_rate: 44100
            },
            language: "ja"
          })
        });

        if (!cartesiaResponse.ok) {
          const errText = await cartesiaResponse.text();
          console.error("Cartesiaエラー詳細:", errText);
          return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
        }

        // 音声のバイナリデータを取得
        const audioBuffer = await cartesiaResponse.arrayBuffer();
        
        // 💡 修正：パンクする原因だった古い書き方をやめ、上記の安全な関数（小分け処理）を使うように変更
        const audioBase64 = arrayBufferToBase64(audioBuffer);

        // --- ③ テキストと音声（Base64）をセットにして画面に返す ---
        return new Response(JSON.stringify({ reply, audio: audioBase64 }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Workers内部エラー:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
    }
  }
};
