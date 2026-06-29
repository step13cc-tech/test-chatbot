import htmlContent from "./index.html";

export default {
  async fetch(request, env) {
    // 1. チャット画面（HTML）を表示する処理 (GET)
    // 💡 これがあるから、ワーカーズのURLを開くだけで画面が表示されます！
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. Groq APIと通信する処理 (POST)
    if (request.method === "POST") {
      try {
        // 💡 画面から「メッセージ」と「選ばれたメンバー」を同時に受け取る
        const { message, member } = await request.json();

        // 💡 家族全員のキャラクター設定リスト（セリフ帳）
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

        // 💡 選ばれたメンバーのプロンプトを呼び出す（いなければ自動的にお母さんにする）
        const selectedSystemPrompt = familyPrompts[member] || familyPrompts['mother'];

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
                content: selectedSystemPrompt // 💡 ここを選ばれた家族の性格に自動差し替え！
              },
              { role: "user", content: message }
            ]
          })
        });

        // 【ログ強化】Groqのステータスコードを記録
        console.log("Groq応答ステータス:", groqResponse.status);

        const data = await groqResponse.json();
        
        // 【ログ強化】もしGroq側でエラーが起きていたら、その理由を詳しくログに残す
        if (!groqResponse.ok) {
          console.error("Groqエラー内容:", JSON.stringify(data));
          return new Response(JSON.stringify({ error: "Groq API側でエラーが発生しました" }), { status: groqResponse.status });
        }

        const reply = data.choices[0].message.content;

        return new Response(JSON.stringify({ reply }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        // 【ログ強化】プログラム自体が失敗した場合の理由を記録
        console.error("Workers内部エラー:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
};
