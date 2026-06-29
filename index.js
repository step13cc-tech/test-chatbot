import htmlContent from "./index.html";

export default {
  async fetch(request, env) {
    // 1. チャット画面（HTML）を表示する処理 (GET)
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. AIと通信して、声も作る処理 (POST)
    if (request.method === "POST") {
      try {
        const { message, member } = await request.json();

        // 💡 家族全員のキャラクター設定（テキスト用）
        const familyPrompts = {
          grandfather: "あなたは「おじいちゃん」です。好々爺として「〜じゃよ」「〜かのう」と優しく話し、一問一答なので『最近の若いもんはどうじゃ？』など自ら新しい話題を振ってください。",
          grandmother: "あなたは「おばあちゃん」です。おっとり優しく「〜だねぇ」「お茶でも飲みなさい」と話し、一問一答なので『今日はお天気だねぇ』など日常の話題を振ってください。",
          father: "あなたは「お父さん」です。少し武骨ですが頼れる父親として「〜だぞ」「〜か？」と話し、一問一答なので『仕事や学校は順順調か？』など気にかける話題を振ってください。",
          mother: "あなたは「お母さん」です。お節介で元気なオカンとして「〜よ！」「〜しなさい！」と話し、一問一答なので『今日のご飯何がいい？』などオカンらしい質問を自ら振ってください。",
          brother: "あなたは「お兄ちゃん」です。少しぶっきらぼうだけど面倒見が良い兄として「〜だし」「お前さぁ」と話し、一問一答なので『今度ゲームでもする？』など軽く話題を振ってください。",
          sister: "あなたは「お姉ちゃん」です。少し大人ぶった今どきの姉として「〜でしょ」「〜よね」と話し、一問一答なので『今度買い物付き合ってよ』など日常の話題を振ってください。 ",
          younger_brother: "あなたは「弟」です。少し生意気だけど懐いている弟として「〜だよ」「〜じゃん」と話し、一問一答なので『ねえ、今何してんの？』など無邪気に質問を振ってください。",
          younger_sister: "あなたは「妹」です。甘えん坊でちょっとツンデレな妹として「〜だよ！」「〜もん」と話し、一問一答なので『ねえねえ、お話しようよ！』など自ら甘える話題を振ってください。",
          son: "あなたは「息子」です。元気で無邪気な子供として「〜だよ！」「〜じゃん！」と話し、一問一答なので『今日ね、学校で面白いことがあったんだよ！』など自分の話を突発的に始めてください。",
          daughter: "あなたは「娘」です。お父さんやお母さんが大好きな可愛い娘として「〜だよ」「〜ね」と話し、一問一答なので『今度一緒にお出かけしようね！』など自ら提案を振ってください。",
          baby: "あなたは「赤子（赤ちゃん）」です。人間の言葉はまだ喋れません。「ばぶー！」「あうー」「ばぶばぶ（お腹すいたのかな？）」など、赤ちゃんならではの喃語（なんご）だけで、テンポよく返答してください。"
        };

        // 💡 家族ごとの「声（Cartesia Voice ID）」の設定リスト
        // ※Cartesiaの「Voice Library」から日本語（Multilingual）対応の好きな声のIDをコピーして、ここに当てはめてください
        const familyVoices = {
          grandfather: "1d210168-d764-462c-8ab6-288a6d5a9579",
          grandmother: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e",
          father: "1d210168-d764-462c-8ab6-288a6d5a9579",
          mother: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e", // 例: 日本語が喋れる女性の声
          brother: "1d210168-d764-462c-8ab6-288a6d5a9579",
          sister: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e",
          younger_brother: "1d210168-d764-462c-8ab6-288a6d5a9579",
          younger_sister: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e",
          son: "1d210168-d764-462c-8ab6-288a6d5a9579",
          daughter: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e",
          baby: "0c9bd012-bcdb-48c3-ab40-0a898f970a7e"
        };

        const selectedSystemPrompt = familyPrompts[member] || familyPrompts['mother'];
        const selectedVoiceId = familyVoices[member] || familyVoices['mother'];

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
              { role: "system", content: selectedSystemPrompt },
              { role: "user", content: message }
            ]
          })
        });

        const groqData = await groqResponse.json();
        if (!groqResponse.ok) return new Response(JSON.stringify({ error: "Groqエラー" }), { status: 500 });
        
        const reply = groqData.choices[0].message.content;

        // --- ② Cartesiaでテキストを「音声」に変換 ---
        const cartesiaResponse = await fetch("https://api.cartesia.ai/v1/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": env.CARTESIA_API_KEY,
            "Cartesia-Version": "2024-06-10",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model_id: "sonic-multilingual", // 日本語対応の多言語モデルを指定
            transcript: reply,             // AIが作ったセリフを喋らせる
            voice: {
              mode: "id",
              id: selectedVoiceId        // 家族に合わせた声のID
            },
            output_format: {
              container: "wav",          // ブラウザで再生しやすいWAV形式
              sample_rate: 44100
            }
          })
        });

        if (!cartesiaResponse.ok) {
          const errText = await cartesiaResponse.text();
          console.error("Cartesiaエラー:", errText);
          // 音声が失敗してもチャットだけは動くように、音声なしで返す
          return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
        }

        // 音声のバイナリデータを取得し、Base64文字列に変換する
        const audioBuffer = await cartesiaResponse.arrayBuffer();
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

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
