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

// 🚫 群管功能：违禁词配置（你可以自行增删）
// 广告检测关键词（支持填链接特征或常见广告词）
const AD_KEYWORDS = ["t.me/", "http://", "https://", "加微", "兼职", "代发", "博彩", "刷单"];
// 色情信息检测关键词
const PORN_KEYWORDS = ["裸聊", "看片", "赌场", "约炮", "迷药", "外围"];

// 📦 存储上一次发送的消息 ID（内存缓存，若绑定了 Cloudflare KV 则会自动持久化到 KV）
const lastMessageIds = new Map();

/** 获取指定群组/私聊上一次发送的消息 ID */
async function getLastMsgId(chatId, env = null) {
  const key = String(chatId);
  if (env && env.LAST_MSG_KV) {
    try {
      const val = await env.LAST_MSG_KV.get(`last_msg_${key}`);
      if (val) return parseInt(val, 10);
    } catch (e) {
      console.error(`[KV] 读取 chatId ${chatId} 失败:`, e);
    }
  }
  return lastMessageIds.get(key) || null;
}

/** 记录指定群组/私聊最新发送的消息 ID */
async function setLastMsgId(chatId, messageId, env = null) {
  const key = String(chatId);
  lastMessageIds.set(key, messageId);
  if (env && env.LAST_MSG_KV) {
    try {
      await env.LAST_MSG_KV.put(`last_msg_${key}`, String(messageId));
    } catch (e) {
      console.error(`[KV] 写入 chatId ${chatId} 失败:`, e);
    }
  }
}

// ============================================================
//  🚀  Cloudflare Worker 入口
// ============================================================
export default {

  // ① 定时任务：按 Cron 自动向群组广播推广消息（自动删上一条）
  async scheduled(event, env, ctx) {
    for (const chatId of BROADCAST_CHAT_IDS) {
      await sendPromoPhoto(chatId, env);
    }
  },

  // ② Webhook：接收 Telegram 推送的用户消息并自动回复
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
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

async function handleUpdate(update, env = null) {
  // ── 处理入群验证的按钮点击 (Callback Query) ──────────────────────
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId   = message.chat.id;
  const chatType = message.chat.type; // "private" | "group" | "supergroup" | "channel"
  const text     = (message.text || message.caption || "").trim(); // 包含图文说明
  const isPrivate = chatType === "private";

  // ── 1. 处理新人入群 (入群验证) & 删除进群系统提示 ──────────────
  if (message.new_chat_members) {
    // 顺手删除 Telegram 官方的“XXX加入了群组”系统消息
    await deleteMessage(chatId, message.message_id);

    for (const member of message.new_chat_members) {
      if (member.is_bot) continue; // 忽略机器人
      
      // 禁言该用户
      await restrictChatMember(chatId, member.id, false);
      
      // 发送验证按钮 (使用 Markdown 格式让 @ 用户生效)
      const mention = `[${member.first_name || '新成员'}](tg://user?id=${member.id})`;
      const verifyText = `欢迎 ${mention} 加入！\n⚠️ 为了防止广告机器人，请点击下方按钮完成人机验证，否则将无法发言。`;
      const keyboard = {
        inline_keyboard: [[{ text: "🤖 我是人类，点击解除禁言", callback_data: `verify_${member.id}` }]]
      };
      await sendMessage(chatId, verifyText, keyboard, "Markdown", false, env);
    }
    return;
  }

  // ── 1.5 处理用户退群 (自动删除退群提示) ────────────────────────
  if (message.left_chat_member) {
    await deleteMessage(chatId, message.message_id);
    return;
  }

  // ── 2. 广告与色情检测 (群聊中拦截) ──────────────────────────────
  if (!isPrivate && text) {
    const isAd = AD_KEYWORDS.some(kw => text.includes(kw));
    const isPorn = PORN_KEYWORDS.some(kw => text.includes(kw));
    
    if (isAd || isPorn) {
      // 发现违规内容，直接删除
      await deleteMessage(chatId, message.message_id);
      console.log(`已删除违规消息 (${isAd ? '广告' : '色情'})`);
      return; // 拦截，不再往下走
    }
  }

  // ── 3. 判断是否需要响应原本的推广功能 ─────────────────────────────
  const isMentioned = text.includes(BOT_USERNAME); // 群里艾特了机器人

  // 推广和客服功能：私聊直接处理；群里只处理艾特了机器人的消息
  if (!isPrivate && !isMentioned) return;

  // ── /start：第一次建立连接时欢迎 ─────────────────────────────
  if (text === "/start" || text.startsWith("/start ")) {
    await sendMessage(chatId, WELCOME_TEXT, null, null, true, env);
    return;
  }

  // ── 关键词匹配：发送推广消息 ──────────────────────────────────
  const hit = KEYWORDS.some((kw) => text.includes(kw));
  if (hit) {
    await sendPromoPhoto(chatId, env);
    return;
  }
}

// ── 入群验证按钮逻辑 ─────────────────────────────────────────────
async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data;
  const fromId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (data.startsWith("verify_")) {
    const targetUserId = parseInt(data.replace("verify_", ""));
    
    // 检查是不是被要求验证的本人点的
    if (fromId === targetUserId) {
      // 验证成功，解除禁言
      await restrictChatMember(chatId, fromId, true);
      await answerCallbackQuery(callbackQuery.id, "✅ 验证通过，您可以自由发言了！", true);
      // 删除验证消息本身
      await deleteMessage(chatId, messageId);
    } else {
      // 不是本人点，弹窗提示
      await answerCallbackQuery(callbackQuery.id, "❌ 请让新进群的用户自己点击验证！", true);
    }
  }
}

// ============================================================
//  📤  Telegram API 封装
// ============================================================

/** 发送推广图片（含按钮），并自动删除上一次发送的消息 */
async function sendPromoPhoto(chatId, env = null) {
  // 1. 删除该群/私聊上一次发送的消息
  const oldMsgId = await getLastMsgId(chatId, env);
  if (oldMsgId) {
    console.log(`[删旧消息] 正在删除 chatId: ${chatId} 上一条消息 ID: ${oldMsgId}`);
    await deleteMessage(chatId, oldMsgId);
  }

  // 2. 发送新的推广消息
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
    if (result.ok && result.result?.message_id) {
      // 3. 保存最新发送的消息 ID
      await setLastMsgId(chatId, result.result.message_id, env);
    }
  } catch (e) {
    console.error(`sendPhoto → ${chatId} 失败:`, e);
  }
}

/** 发送纯文字消息 (支持附加键盘、格式，以及选择性删除上一次发送的消息) */
async function sendMessage(chatId, text, reply_markup = null, parse_mode = null, deletePrevious = false, env = null) {
  if (deletePrevious) {
    const oldMsgId = await getLastMsgId(chatId, env);
    if (oldMsgId) {
      console.log(`[删旧消息] 正在删除 chatId: ${chatId} 上一条消息 ID: ${oldMsgId}`);
      await deleteMessage(chatId, oldMsgId);
    }
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const body = { chat_id: chatId, text: text };
    if (reply_markup) body.reply_markup = reply_markup;
    if (parse_mode) body.parse_mode = parse_mode;

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    console.log(`sendMessage → ${chatId}:`, result.ok);
    if (result.ok && result.result?.message_id && deletePrevious) {
      await setLastMsgId(chatId, result.result.message_id, env);
    }
  } catch (e) {
    console.error(`sendMessage → ${chatId} 失败:`, e);
  }
}

/** 禁言/解除禁言用户 */
async function restrictChatMember(chatId, userId, canSpeak) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/restrictChatMember`;
  try {
    const permissions = canSpeak ? {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    } : {
      can_send_messages: false
    };

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        user_id: userId,
        permissions: permissions
      })
    });
  } catch (e) {
    console.error("restrictChatMember 失败:", e);
  }
}

/** 删除消息 */
async function deleteMessage(chatId, messageId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    const result = await res.json();
    if (!result.ok) {
      console.warn(`deleteMessage (${chatId}, ${messageId}) 结果:`, result.description);
    }
    return result.ok;
  } catch (e) {
    console.error("deleteMessage 失败:", e);
    return false;
  }
}

/** 响应 Callback Query (按钮点击弹窗) */
async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
      })
    });
  } catch (e) {
    console.error("answerCallbackQuery 失败:", e);
  }
}