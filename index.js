import htmlContent from "./index.html";

// 大きな音声データでもパンクしないように小分けにして安全にBase64に変換する関数
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 65536;
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
        let userMessage = "";
        const contentType = request.headers.get("content-type") || "";

        // --- ① 送られてきたデータが「音声ファイル」か「文字」かを判別 ---
        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const audioFile = formData.get("file");

          if (!audioFile) {
            return new Response(JSON.stringify({ error: "音声ファイルが見つかりません" }), { status: 400 });
          }

          // 🎙️ Whisper (文字起こし) は引き続きGroqで高速処理
          const whisperFormData = new FormData();
          whisperFormData.append("file", audioFile, "audio.webm");
          whisperFormData.append("model", "whisper-large-v3-turbo"); 
          whisperFormData.append("language", "ja");

          const whisperResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.GROQ_API_KEY}`
            },
            body: whisperFormData
          });

          if (!whisperResponse.ok) {
            const whisperErr = await whisperResponse.text();
            console.error("Whisperエラー:", whisperErr);
            throw new Error("声の聞き取りに失敗しちゃった");
          }

          const whisperData = await whisperResponse.json();
          userMessage = whisperData.text; 

        } else {
          const body = await request.json();
          userMessage = body.message;
        }

        if (!userMessage || !userMessage.trim()) {
          return new Response(JSON.stringify({ error: "メッセージが空です" }), { status: 400 });
        }


        // --- ② 【頭脳変更】Cloudflare内蔵の Workers AI (Qwen) でセリフを生成 ---
        // 💡 env.AI.run を使い、Cloudflareが提供するQwenモデルを直接呼び出します
        const aiResponse = await env.AI.run('@cf/qwen/qwen2.5-7b-instruct', {
          messages: [
            {
              role: "system",
              content: "あなたはユーザーの家族です。チャットアプリ風に短くテンポよく返すこと。"
            },
            { role: "user", content: userMessage }
          ]
        });

        // Workers AIの返答テキストは「response」というプロパティに入っています
        const reply = aiResponse.response;

        if (!reply) {
          throw new Error("Cloudflare Workers AI からの返答が空でした");
        }


        // --- ③ Cartesiaでテキストを「音声」に変換 ---
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
              id: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e" 
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
          return new Response(JSON.stringify({ user_text: userMessage, reply }), { headers: { "Content-Type": "application/json" } });
        }

        const audioBuffer = await cartesiaResponse.arrayBuffer();
        const audioBase64 = arrayBufferToBase64(audioBuffer);

        // --- ④ データをセットにして返す ---
        return new Response(JSON.stringify({ 
          user_text: userMessage, 
          reply: reply, 
          audio: audioBase64 
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        console.error("Workers内部エラー:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
    }
  }
};
