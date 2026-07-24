// ============================================================
//  ⚙️  全局配置区 —— 后期修改消息内容只需改这里！
// ============================================================

const BOT_TOKEN = "8944862069:AAGgJGscbdJDifKwfhKJNf_hdForVkHFn5U";

// ⚠️ 填入你的机器人用户名（带@），群里艾特机器人时用来识别
const BOT_USERNAME = "@chengfeng_daifugua_bot";

// 定时广播的目标群组
const BROADCAST_CHAT_IDS = [
  "-1003518963517",
  "-1003737910913",
];

// ⭐ 核心推广消息配置 —— 关键词触发 & 定时任务 都发这条消息
//    后期想改消息，只改这里就行！
const PROMO_MESSAGE = {
  photo:   "https://i.postimg.cc/fRzRTQY9/Gemini-G.png",
  caption: "",  // 图片说明文字，留空则不显示
  keyboard: {
    inline_keyboard: [
      [
        { text: "⬇️ 下载地址", url: "https://cfindex.omen66omen66.workers.dev" },
      ],
      [
        { text: "续费/售后/反馈", url: "https://t.me/chenze88888888" },
        { text: "续费/售后",      url: "https://t.me/x_xxx88"         },
      ],
    ],
  },
};

// /start 欢迎消息（第一次建立连接时回复）
const WELCOME_TEXT =
  `👋 你好，欢迎使用！\n\n` +
  `💬 发送「下载」→ 获取下载地址\n` +
  `📞 发送「售后」→ 联系售后客服`;

// 触发关键词列表 —— 后期想加关键词直接在这里追加
const KEYWORDS = ["下载", "售后"];

// ============================================================
//  🚀  Cloudflare Worker 入口
// ============================================================
export default {

  // ① 定时任务：按 Cron 自动向群组广播推广消息
  async scheduled(event, env, ctx) {
    for (const chatId of BROADCAST_CHAT_IDS) {
      await sendPromoPhoto(chatId);
    }
  },

  // ② Webhook：接收 Telegram 推送的用户消息并自动回复
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update);
      } catch (e) {
        console.error("处理 Webhook 失败:", e);
      }
    }
    return new Response("OK", { status: 200 });
  },
};

// ============================================================
//  🤖  消息处理逻辑
// ============================================================

async function handleUpdate(update) {
  const message = update.message;
  if (!message) return;

  const chatId   = message.chat.id;
  const chatType = message.chat.type; // "private" | "group" | "supergroup" | "channel"
  const text     = (message.text || "").trim();

  // ── 判断是否需要响应 ─────────────────────────────────────────
  const isPrivate   = chatType === "private";
  const isMentioned = text.includes(BOT_USERNAME); // 群里艾特了机器人

  // 私聊直接处理；群里只处理艾特了机器人的消息
  if (!isPrivate && !isMentioned) return;

  // ── /start：第一次建立连接时欢迎 ─────────────────────────────
  if (text === "/start" || text.startsWith("/start ")) {
    await sendMessage(chatId, WELCOME_TEXT);
    return;
  }

  // ── 关键词匹配：发送推广消息 ──────────────────────────────────
  const hit = KEYWORDS.some((kw) => text.includes(kw));
  if (hit) {
    await sendPromoPhoto(chatId);
    return;
  }
}

// ============================================================
//  📤  Telegram API 封装
// ============================================================

/** 发送推广图片（含按钮） */
async function sendPromoPhoto(chatId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:      chatId,
        photo:        PROMO_MESSAGE.photo,
        caption:      PROMO_MESSAGE.caption,
        reply_markup: PROMO_MESSAGE.keyboard,
      }),
    });
    const result = await res.json();
    console.log(`sendPhoto → ${chatId}:`, result.ok);
  } catch (e) {
    console.error(`sendPhoto → ${chatId} 失败:`, e);
  }
}

/** 发送纯文字消息 */
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const result = await res.json();
    console.log(`sendMessage → ${chatId}:`, result.ok);
  } catch (e) {
    console.error(`sendMessage → ${chatId} 失败:`, e);
  }
}