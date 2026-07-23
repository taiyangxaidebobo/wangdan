export default {
  async scheduled(event, env, ctx) {
    // 1. 填入你的 Token
    const BOT_TOKEN = "8944862069:AAGgJGscbdJDifKwfhKJNf_hdForVkHFn5U"; 
    
    // 2. 将单个 ID 改为包含多个 ID 的数组（注意每个 ID 都要加双引号，中间用逗号隔开）
    const CHAT_IDS = [
      "-1003518963517", // 你的第一个群 ID
      "-1003737910913"  // 你的第二个群 ID
    ];
    
    // 3. 你的图片链接和文字说明
    const PHOTO_URL = "https://i.postimg.cc/fRzRTQY9/Gemini-G.png"; 
    const CAPTION_TEXT = "";

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;

    // 4. 按钮配置保持不变
    const keyboard = {
      inline_keyboard: [
        [
          { text: " 下载地址 ", url: "https://cfindex.omen66omen66.workers.dev" }
        ],
        [
          { text: "续费/售后/反馈", url: "https://t.me/chenze88888888" },
          { text: "续费/售后", url: "https://t.me/x_xxx88" }
        ]
      ]
    };

    // 5. 核心改动：增加一个 for 循环，自动给列表里的每个群发消息
    for (const chatId of CHAT_IDS) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId, // 这里自动读取当前循环的群 ID
            photo: PHOTO_URL,      
            caption: CAPTION_TEXT, 
            reply_markup: keyboard 
          })
        });
        
        const result = await response.json();
        console.log(`群 ${chatId} 发送结果:`, result);

      } catch (error) {
        console.error(`群 ${chatId} 请求失败:`, error);
      }
    }
  }
};