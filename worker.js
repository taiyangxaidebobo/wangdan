// ============================================================
//  ⚙️  全局配置区 —— 后期修改消息内容只需改这里！
// ============================================================

const BOT_TOKEN = "8944862069:AAGgJGscbdJDifKwfhKJNf_hdForVkHFn5U";

// ⚠️ 填入你的机器人用户名（带@），群里艾特机器人时用来识别
const BOT_USERNAME = "@chengfeng_daifugua_bot";

// 定时广播的目标群组
const BROADCAST_CHAT_IDS = [
  "-1003518963517",
];

// 👑 管理员 Telegram 用户数字 ID（填入后只有管理员可执行 /stats、/broadcast、/ban 等管理指令）
const ADMIN_IDS = [
  "7567397654",
];

// ⭐ 核心推广消息配置 —— 支持多套文案/图片轮播展示
const PROMO_MESSAGES = [
  {
    photo:   "https://i.postimg.cc/9FyZnPtk/xunjie-final-poster-1785696923575.jpg",
    caption: "🔥 **代副挂最新稳定版已更新！**\n具备防封防护与高效率运营，欢迎下载体验。",
    keyboard: {
      inline_keyboard: [
        [
          { text: "⬇️ 官方下载地址", url: "https://cfindex.omen66omen66.workers.dev" },
        ],
        [
          { text: "续费/售后/反馈", url: "https://t.me/chenze88888888" },
        ],
      ],
    },
  },
  {
    photo:   "https://i.postimg.cc/fRzRTQY9/Gemini-G.png",
    caption: "⚡ **全自动稳定运行 · 助您流量暴涨！**\n售后请认准官方客服，防伪防诈骗。",
    keyboard: {
      inline_keyboard: [
        [
          { text: "⬇️ 点击获取最新包", url: "https://cfindex.omen66omen66.workers.dev" },
        ],
        [
          { text: "💬 联系售后客服", url: "https://t.me/chenze88888888" },
        ],
      ],
    },
  },
];

// /start 欢迎消息（第一次建立连接或私聊时回复）
const WELCOME_TEXT =
  `👋 你好，欢迎使用自动化助手！\n\n` +
  `💬 发送「下载」→ 获取最新下载地址\n` +
  `📞 发送「售后」→ 联系客服团队\n\n` +
  `⚙️ 管理员指令：\n` +
  `🚫 回复消息发送 /ban → 拉黑并踢出违规用户\n` +
  `✅ 发送 /unban <ID> → 解除指定用户黑名单\n` +
  `📋 发送 /banlist → 查看黑名单列表\n` +
  `📊 发送 /stats → 查看运行数据看板\n` +
  `📢 发送 /broadcast <内容> → 一键广播文本消息`;

// 触发关键词列表
const KEYWORDS = ["下载", "售后"];

// 🚫 群管功能：违禁词配置
const AD_KEYWORDS = ["t.me/", "http://", "https://", "加微", "兼职", "代发", "博彩", "刷单"];
const PORN_KEYWORDS = ["裸聊", "看片", "赌场", "约炮", "迷药", "外围"];

// ⚡ 防刷屏 / 限速配置
const RATE_LIMIT = {
  maxMessages: 3,       // 允许的最大消息数
  windowSeconds: 5,     // 时间窗口（秒）：5秒内发超过3条将被认定为刷屏
};

// 🌙 定时广播夜间避打扰设置（北京时间 UTC+8）
const NIGHT_QUIET_HOURS = {
  enabled: true,        // 是否开启夜间避打扰
  startHour: 23,        // 晚上 23:00 开始避打扰
  endHour: 8,           // 早上 08:00 恢复广播
};

// ============================================================
//  📦  缓存与持久化 (Memory Map + Cloudflare KV 降级)
// ============================================================

// 1. 存储上一次发送的消息 ID
const lastMessageIds = new Map();

// 2. 统计看板缓存
const statsCache = {
  adsIntercepted: 0,
  pornIntercepted: 0,
  rateLimitTriggers: 0,
  verifiedMembers: 0,
  totalBroadcasts: 0,
};

// 3. 防刷屏用户发言时间戳记录 (userId -> number[])
const userMsgTimestamps = new Map();

// 4. 全局黑名单缓存 (Set)
const blacklistCache = new Set();

/** 判断用户是否在黑名单中 */
async function isBlacklisted(userId, env = null) {
  const key = String(userId);
  if (blacklistCache.has(key)) return true;
  if (env && env.LAST_MSG_KV) {
    try {
      const val = await env.LAST_MSG_KV.get(`blacklist_${key}`);
      if (val === "true") {
        blacklistCache.add(key);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/** 将用户加入黑名单 */
async function addToBlacklist(userId, env = null) {
  const key = String(userId);
  blacklistCache.add(key);
  if (env && env.LAST_MSG_KV) {
    try {
      await env.LAST_MSG_KV.put(`blacklist_${key}`, "true");
    } catch (e) {}
  }
}

/** 将用户移出黑名单 */
async function removeFromBlacklist(userId, env = null) {
  const key = String(userId);
  blacklistCache.delete(key);
  if (env && env.LAST_MSG_KV) {
    try {
      await env.LAST_MSG_KV.delete(`blacklist_${key}`);
    } catch (e) {}
  }
}

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

/** 累加统计计数 */
async function incrementStat(key, env = null) {
  statsCache[key] = (statsCache[key] || 0) + 1;
  if (env && env.LAST_MSG_KV) {
    try {
      const current = await env.LAST_MSG_KV.get(`stat_${key}`);
      const val = (parseInt(current, 10) || 0) + 1;
      await env.LAST_MSG_KV.put(`stat_${key}`, String(val));
    } catch (e) {}
  }
}

/** 获取最新统计看板数据 */
async function getStats(env = null) {
  const keys = ['adsIntercepted', 'pornIntercepted', 'rateLimitTriggers', 'verifiedMembers', 'totalBroadcasts'];
  const res = { ...statsCache };
  if (env && env.LAST_MSG_KV) {
    try {
      for (const k of keys) {
        const val = await env.LAST_MSG_KV.get(`stat_${k}`);
        if (val !== null) res[k] = parseInt(val, 10) || 0;
      }
    } catch (e) {}
  }
  return res;
}

/** 检查用户发言是否触发防刷屏/限速 */
function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = RATE_LIMIT.windowSeconds * 1000;
  let timestamps = userMsgTimestamps.get(userId) || [];
  
  timestamps = timestamps.filter(t => now - t < windowMs);
  timestamps.push(now);
  userMsgTimestamps.set(userId, timestamps);

  return timestamps.length > RATE_LIMIT.maxMessages;
}

/** 判断当前时间是否属于夜间免打扰时段（北京时间 UTC+8） */
function isNightTime() {
  if (!NIGHT_QUIET_HOURS.enabled) return false;
  const now = new Date();
  const utcHours = now.getUTCHours();
  const bjHours = (utcHours + 8) % 24;
  
  if (NIGHT_QUIET_HOURS.startHour > NIGHT_QUIET_HOURS.endHour) {
    return bjHours >= NIGHT_QUIET_HOURS.startHour || bjHours < NIGHT_QUIET_HOURS.endHour;
  } else {
    return bjHours >= NIGHT_QUIET_HOURS.startHour && bjHours < NIGHT_QUIET_HOURS.endHour;
  }
}

/** 注册并更新 Telegram 聊天框输入 / 自动弹出的快捷指令菜单 */
async function setBotCommands() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`;
  const commands = [
    { command: "start", description: "👋 启动机器人 / 查看功能说明" },
    { command: "ban", description: "🚫 回复某条消息将其拉黑并踢出 (管理员)" },
    { command: "unban", description: "✅ 解除指定用户的黑名单 (管理员)" },
    { command: "banlist", description: "📋 查看当前黑名单列表 (管理员)" },
    { command: "stats", description: "📊 查看运行数据看板 (管理员)" },
    { command: "broadcast", description: "📢 一键广播消息 (管理员)" },
    { command: "myid", description: "🆔 查询我的 Telegram 数字 ID" },
  ];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    return await res.json();
  } catch (e) {
    console.error("setMyCommands 失败:", e);
    return { ok: false, error: String(e) };
  }
}

// ============================================================
//  🚀  Cloudflare Worker 入口
// ============================================================
export default {

  // ① 定时任务：按 Cron 自动向群组广播推广消息（夜间免打扰 + 自动删上一条）
  async scheduled(event, env, ctx) {
    if (isNightTime()) {
      console.log("[定时任务] 当前处于北京时间夜间免打扰时段，跳过广播");
      return;
    }
    for (const chatId of BROADCAST_CHAT_IDS) {
      await sendPromoPhoto(chatId, env);
      await incrementStat("totalBroadcasts", env);
    }
  },

  // ② Webhook：接收 Telegram 推送的用户消息并自动回复
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // GET /set-commands 访问此 URL 可随时手动刷新 Telegram 快捷指令菜单
    if (request.method === "GET" && url.pathname === "/set-commands") {
      const res = await setBotCommands();
      return new Response(JSON.stringify(res, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

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

/** 检查用户是否拥有管理员权限 */
function isAdminUser(userId) {
  if (!ADMIN_IDS || ADMIN_IDS.length === 0) return true; // 若未指定管理员ID，默认均可使用
  return ADMIN_IDS.map(String).includes(String(userId));
}

async function handleUpdate(update, env = null) {
  // ── 处理入群验证的按钮点击 (Callback Query) ──────────────────────
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId   = message.chat.id;
  const chatType = message.chat.type; // "private" | "group" | "supergroup" | "channel"
  const text     = (message.text || message.caption || "").trim(); // 包含图文说明
  const isPrivate = chatType === "private";

  // ── 0. 全局黑名单拦截检测 (黑名单账号直接删消息并踢出) ──────────────
  if (message.from && !message.from.is_bot) {
    const inBlacklist = await isBlacklisted(message.from.id, env);
    if (inBlacklist) {
      await deleteMessage(chatId, message.message_id);
      if (!isPrivate) {
        await banChatMember(chatId, message.from.id);
      }
      console.log(`[黑名单] 自动拦截并删除了黑名单用户 ${message.from.id} 的消息`);
      return;
    }
  }

  // ── 1. 处理新人入群 (入群验证) & 删除进群系统提示 ──────────────
  if (message.new_chat_members) {
    await deleteMessage(chatId, message.message_id);

    for (const member of message.new_chat_members) {
      if (member.is_bot) continue;
      
      await restrictChatMember(chatId, member.id, false);
      
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

  // ── 2. 防刷屏 / 限速检测 (仅群聊非机器人生效) ───────────────────
  if (!isPrivate && message.from && !message.from.is_bot) {
    const isRateLimited = checkRateLimit(message.from.id);
    if (isRateLimited) {
      await deleteMessage(chatId, message.message_id);
      await incrementStat("rateLimitTriggers", env);
      console.log(`[防刷屏] 用户 ${message.from.id} 发言频繁 (${RATE_LIMIT.windowSeconds}s内超过${RATE_LIMIT.maxMessages}条)，已自动拦截删除`);
      return;
    }
  }

  // ── 3. 广告与色情检测 (群聊拦截) ─────────────────────────────
  if (!isPrivate && text) {
    const isAd = AD_KEYWORDS.some(kw => text.includes(kw));
    const isPorn = PORN_KEYWORDS.some(kw => text.includes(kw));
    
    if (isAd || isPorn) {
      await deleteMessage(chatId, message.message_id);
      if (isAd) await incrementStat("adsIntercepted", env);
      if (isPorn) await incrementStat("pornIntercepted", env);
      console.log(`已删除违规消息 (${isAd ? '广告' : '色情'})`);
      return;
    }
  }

  // ── 4. 指令响应：/myid 查询、/setcommands、/ban、/unban、/banlist、/stats & /broadcast ──
  if (text === "/myid" && message.from) {
    await sendMessage(chatId, `🆔 您的 Telegram 用户数字 ID 为: \`${message.from.id}\``, null, "Markdown", false, env);
    return;
  }

  if (text === "/setcommands") {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限刷新指令菜单。", null, null, false, env);
      return;
    }
    const res = await setBotCommands();
    if (res.ok) {
      await sendMessage(chatId, "✅ 快捷指令菜单设置成功！现在在聊天框输入 / 即可弹出快捷菜单。", null, null, false, env);
    } else {
      await sendMessage(chatId, `❌ 快捷指令菜单设置失败: ${JSON.stringify(res)}`, null, null, false, env);
    }
    return;
  }

  // 🚫 回复消息拉黑并踢出用户：/ban
  if (text.startsWith("/ban")) {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限使用 /ban 拉黑指令。", null, null, false, env);
      return;
    }

    let targetUser = null;
    if (message.reply_to_message && message.reply_to_message.from) {
      targetUser = message.reply_to_message.from;
    }

    if (!targetUser) {
      await sendMessage(chatId, "⚠️ 请通过【回复】要拉黑的用户消息，然后发送 `/ban` 指令！", null, "Markdown", false, env);
      return;
    }

    if (isAdminUser(targetUser.id) || targetUser.is_bot) {
      await sendMessage(chatId, "❌ 无法拉黑管理员或机器人账号。", null, null, false, env);
      return;
    }

    await addToBlacklist(targetUser.id, env);
    if (!isPrivate) {
      await banChatMember(chatId, targetUser.id);
      await deleteMessage(chatId, message.reply_to_message.message_id);
    }
    await deleteMessage(chatId, message.message_id);

    const name = targetUser.first_name || "该用户";
    const mention = `[${name}](tg://user?id=${targetUser.id})`;
    await sendMessage(chatId, `🚫 已成功将 ${mention} (\`${targetUser.id}\`) 拉黑并踢出群组！`, null, "Markdown", false, env);
    return;
  }

  // ✅ 解除黑名单与封禁：/unban <ID> 或回复消息发送 /unban
  if (text.startsWith("/unban")) {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限使用 /unban 解封指令。", null, null, false, env);
      return;
    }

    let targetUserId = null;
    if (message.reply_to_message && message.reply_to_message.from) {
      targetUserId = message.reply_to_message.from.id;
    } else {
      const parts = text.split(" ");
      if (parts.length >= 2 && !isNaN(parts[1])) {
        targetUserId = parseInt(parts[1], 10);
      }
    }

    if (!targetUserId) {
      await sendMessage(chatId, "⚠️ 请【回复】被封禁用户的消息发送 `/unban`，或直接发送 `/unban 用户数字ID`。", null, "Markdown", false, env);
      return;
    }

    await removeFromBlacklist(targetUserId, env);
    if (!isPrivate) {
      await unbanChatMember(chatId, targetUserId);
    }

    await sendMessage(chatId, `✅ 已成功将用户 (\`${targetUserId}\`) 移出黑名单并解除封禁！`, null, "Markdown", false, env);
    return;
  }

  // 📋 查看黑名单列表：/banlist
  if (text === "/banlist") {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限查看黑名单。", null, null, false, env);
      return;
    }
    const list = Array.from(blacklistCache);
    const count = list.length;
    const msg = `📋 **全局黑名单列表** (共 ${count} 人)\n` +
      `────────────────────\n` +
      (count > 0 ? list.map(id => `• \`${id}\``).join("\n") : "暂无黑名单记录");
    await sendMessage(chatId, msg, null, "Markdown", false, env);
    return;
  }

  if (text === "/stats") {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限使用 /stats 统计指令。", null, null, false, env);
      return;
    }
    const s = await getStats(env);
    const bjTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const statsMsg = 
      `📊 **机器人运行统计看板**\n` +
      `────────────────────\n` +
      `🚫 **广告拦截**: ${s.adsIntercepted} 次\n` +
      `🔞 **色情拦截**: ${s.pornIntercepted} 次\n` +
      `⚡ **防刷屏触发**: ${s.rateLimitTriggers} 次\n` +
      `🤖 **人机验证通过**: ${s.verifiedMembers} 人\n` +
      `📢 **广播推送总数**: ${s.totalBroadcasts} 次\n` +
      `────────────────────\n` +
      `⏰ **北京时间**: ${bjTime}`;
    await sendMessage(chatId, statsMsg, null, "Markdown", false, env);
    return;
  }

  if (text.startsWith("/broadcast ")) {
    if (message.from && !isAdminUser(message.from.id)) {
      await sendMessage(chatId, "⚠️ 抱歉，您没有权限使用 /broadcast 一键广播指令。", null, null, false, env);
      return;
    }
    const broadcastText = text.replace("/broadcast ", "").trim();
    if (!broadcastText) return;

    let count = 0;
    for (const targetChatId of BROADCAST_CHAT_IDS) {
      await sendMessage(targetChatId, `📢 **广播通知**\n\n${broadcastText}`, null, "Markdown", true, env);
      count++;
      await incrementStat("totalBroadcasts", env);
    }
    await sendMessage(chatId, `✅ 已成功一键广播至 ${count} 个目标群组！`, null, null, false, env);
    return;
  }

  // ── 5. 响应原本的推广功能 ─────────────────────────────────────
  const isMentioned = text.includes(BOT_USERNAME);

  if (!isPrivate && !isMentioned) return;

  if (text === "/start" || text.startsWith("/start ")) {
    await sendMessage(chatId, WELCOME_TEXT, null, null, true, env);
    return;
  }

  const hit = KEYWORDS.some((kw) => text.includes(kw));
  if (hit) {
    await sendPromoPhoto(chatId, env);
    return;
  }
}

// ── 入群验证按钮逻辑 ─────────────────────────────────────────────
async function handleCallbackQuery(callbackQuery, env = null) {
  const data = callbackQuery.data;
  const fromId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (data.startsWith("verify_")) {
    const targetUserId = parseInt(data.replace("verify_", ""));
    
    if (fromId === targetUserId) {
      await restrictChatMember(chatId, fromId, true);
      await answerCallbackQuery(callbackQuery.id, "✅ 验证通过，您可以自由发言了！", true);
      await deleteMessage(chatId, messageId);
      await incrementStat("verifiedMembers", env);
    } else {
      await answerCallbackQuery(callbackQuery.id, "❌ 请让新进群的用户自己点击验证！", true);
    }
  }
}

// ============================================================
//  📤  Telegram API 封装
// ============================================================

// 轮播索引计数器
let promoRotationIndex = 0;

/** 发送推广图片（含按钮，支持多套轮播，并自动删除上一条消息） */
async function sendPromoPhoto(chatId, env = null) {
  // 1. 删除该群/私聊上一次发送的消息
  const oldMsgId = await getLastMsgId(chatId, env);
  if (oldMsgId) {
    console.log(`[删旧消息] 正在删除 chatId: ${chatId} 上一条消息 ID: ${oldMsgId}`);
    await deleteMessage(chatId, oldMsgId);
  }

  // 2. 从轮播列表中取出当前推广内容
  const promo = PROMO_MESSAGES[promoRotationIndex % PROMO_MESSAGES.length];
  promoRotationIndex++;

  // 3. 发送新的推广消息
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:      chatId,
        photo:        promo.photo,
        caption:      promo.caption,
        parse_mode:   "Markdown",
        reply_markup: promo.keyboard,
      }),
    });
    const result = await res.json();
    console.log(`sendPhoto → ${chatId}:`, result.ok);
    if (result.ok && result.result?.message_id) {
      await setLastMsgId(chatId, result.result.message_id, env);
    }
  } catch (e) {
    console.error(`sendPhoto → ${chatId} 失败:`, e);
  }
}

/** 发送纯文字消息 */
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

/** 封禁/踢出群成员 */
async function banChatMember(chatId, userId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/banChatMember`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    const result = await res.json();
    return result.ok;
  } catch (e) {
    console.error("banChatMember 失败:", e);
    return false;
  }
}

/** 解除封禁群成员 */
async function unbanChatMember(chatId, userId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/unbanChatMember`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId, only_if_banned: true })
    });
    const result = await res.json();
    return result.ok;
  } catch (e) {
    console.error("unbanChatMember 失败:", e);
    return false;
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
