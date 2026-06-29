import htmlContent from "./index.html";

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
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (request.method === "POST") {
      const startTotal = Date.now();
      try {
        let userMessage = "";
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const audioFile = formData.get("file");

          if (!audioFile) {
            return new Response(JSON.stringify({ error: "音声ファイルが見つかりません" }), { status: 400 });
          }

          // 🎙️ Whisper (文字起こし)
          const startWhisper = Date.now();
          const whisperFormData = new FormData();
          whisperFormData.append("file", audioFile, "audio.webm");
          whisperFormData.append("model", "whisper-large-v3-turbo"); 
          whisperFormData.append("language", "ja");

          const whisperResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}` },
            body: whisperFormData
          });

          if (!whisperResponse.ok) {
            const whisperErr = await whisperResponse.text();
            console.error("Whisperエラー:", whisperErr);
            throw new Error("声の聞き取りに失敗しちゃった");
          }

          const whisperData = await whisperResponse.json();
          userMessage = whisperData.text; 
          console.log(`【1. 文字起こし完了】所要時間: ${Date.now() - startWhisper}ms | 聞き取った文字: "${userMessage}"`);

        } else {
          const body = await request.json();
          userMessage = body.message;
        }

        if (!userMessage || !userMessage.trim()) {
          return new Response(JSON.stringify({ error: "メッセージが空です" }), { status: 400 });
        }


        // 🧠 Groq (Qwen3-32B) でお返事生成
        const startLLM = Date.now();
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "qwen/qwen3-32b", 
            max_tokens: 300, // 💡 思考を出し切らせてから本番のセリフを出させるために広げます
            messages: [
              {
                role: "system",
                content: "あなたはユーザーの家族です。チャットアプリ風に、20文字前後の1文で、短くテンポよく返すこと。思考プロセス(<think>)を出力した後は、必ずユーザーへの短い返答を書いて終了してください。"
              },
              { role: "user", content: userMessage }
            ]
          })
        });

        if (!groqResponse.ok) {
          const groqErr = await groqResponse.text();
          console.error("Groq LLMエラー:", groqErr);
          throw new Error("お返事を考えるのに失敗しちゃった");
        }

        const groqData = await groqResponse.json();
        let reply = groqData.choices[0].message.content;

        // 💡 【超重要】AIの独り言（<think>〜</think>）をきれいに削ぎ落とす
        reply = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        // 万が一、閉じタグを忘れて途中で切れていた場合のセーフティ
        reply = reply.replace(/<think>[\s\S]*/g, "").trim();

        // もし空っぽになってしまった場合のフォールバック
        if (!reply) {
          reply = "どうしたのー？";
        }

        console.log(`【2. AI思考完了】所要時間: ${Date.now() - startLLM}ms | 実際のセリフ: "${reply}" (文字数: ${reply.length})`);


        // 🔊 Cartesia (音声合成)
        const startTTS = Date.now();
        const cartesiaResponse = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": env.CARTESIA_API_KEY,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model_id: "sonic-latest",
            transcript: reply, // 💡 削ぎ落とされた綺麗なセリフだけが渡ります
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
        console.log(`【3. 音声合成完了】所要時間: ${Date.now() - startTTS}ms`);

        console.log(`=== 【全処理完了】トータル時間: ${Date.now() - startTotal}ms ===`);

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
