const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "YOUR_PERSONAL_CHAT_ID";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 📋 កំណត់ Bot Commands Menu ដើម្បីឱ្យលោតចេញពេលចុចវាយសញ្ញា "/"
bot.setMyCommands([
    { command: '/status', description: '📊 ឆែកមើល Balance, Floating & Settings' },
    { command: '/menu', description: '📖 បង្ហាញ Panel និងពាក្យបញ្ជាទាំងអស់' },
    { command: '/start_ea', description: '🟢 បើកដំណើរការ EA' },
    { command: '/pause_ea', description: '⏸️ ផ្អាកការបើក Order ថ្មី' },
    { command: '/target', description: '🎯 កែសម្រួល Basket Target $/Order' },
    { command: '/target_pct', description: '🎯 កែសម្រួល Basket Target % Balance' },
    { command: '/sl_money', description: '🛑 កាត់ខាត Max Loss តាមទឹកប្រាក់ ($)' },
    { command: '/sl_pct', description: '🛑 កាត់ខាត Max Drawdown តាមភាគរយ (%)' },
    { command: '/sl', description: '🛑 បិទការកាត់ខាតស្វ័យប្រវត្តិ (/sl off)' },
    { command: '/lot', description: '📐 កែសម្រួល Start Lot' },
    { command: '/step', description: '📏 កែសម្រួល Grid Step' },
    { command: '/mult', description: '✖️ កែសម្រួល Lot Multiplier' },
    { command: '/mode', description: '🎛️ ប្តូរម៉ូតគុណ Lot (block ឬ order)' },
    { command: '/block', description: '📦 កែសម្រួលចំនួន Block Size' },
    { command: '/hedge', description: '🔒 បើក/បិទ Hedge Lock (on ឬ off)' },
    { command: '/news', description: '📰 បើក/បិទ News Filter (on ឬ off)' },
    { command: '/friday', description: '🔒 បើក/បិទ Friday Lock (on ឬ off)' },
    { command: '/closeall', description: '🛑 បិទរាល់ Position ទាំងអស់ជាបន្ទាន់' },
    { command: '/logout', description: '🔒 ចាកចេញពីគណនីបច្ចុប្បន្ន' }
]).catch(() => {});

const accountsDB = {}; 
const userSessions = {}; 

function notifyAdmin(actionText, acc, userMsg) {
    if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === "YOUR_PERSONAL_CHAT_ID") return;
    
    const sender = userMsg.from ? `@${userMsg.from.username || userMsg.from.first_name}` : "Unknown";
    const timeStr = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' });

    let logMsg = `🔔 <b>[ADMIN AUDIT LOG]</b>\n`;
    logMsg += `———————————————\n`;
    logMsg += `👤 <b>User:</b> ${sender} (ChatID: <code>${userMsg.chat.id}</code>)\n`;
    logMsg += `🏦 <b>Account MT5:</b> <code>${acc}</code>\n`;
    logMsg += `📝 <b>សកម្មភាព:</b> ${actionText}\n`;
    logMsg += `⏰ <b>ម៉ោង:</b> ${timeStr}`;

    bot.sendMessage(ADMIN_CHAT_ID, logMsg, { parse_mode: 'HTML' }).catch(() => {});
}

// --- API Sync MT5 EA ---
app.post('/api/sync', (req, res) => {
    const { 
        account, password, balance, floating, buys, sells, marketState,
        initialTarget, initialLot, initialStep, initialBlock, initialMultiplier,
        initialMultiplyMode, initialUseTargetPct, initialBasketTargetPct, initialUseHedge,
        initialMaxLossUSD, initialMaxDrawdownPct
    } = req.body;

    if (!account) return res.status(400).json({ error: "Missing account ID" });

    if (!accountsDB[account]) {
        accountsDB[account] = {
            password: password || "13245",
            active: true, 
            target: initialTarget !== undefined ? initialTarget : 10.0,
            lot: initialLot !== undefined ? initialLot : 0.01,
            step: initialStep !== undefined ? initialStep : 0.4,
            block: initialBlock !== undefined ? initialBlock : 12,
            multiplier: initialMultiplier !== undefined ? initialMultiplier : 1.08,
            multiplyMode: initialMultiplyMode !== undefined ? initialMultiplyMode : 0,
            useTargetPct: initialUseTargetPct !== undefined ? initialUseTargetPct : false,
            basketTargetPct: initialBasketTargetPct !== undefined ? initialBasketTargetPct : 1.0,
            useHedge: initialUseHedge !== undefined ? initialUseHedge : false,
            maxLossUSD: initialMaxLossUSD !== undefined ? initialMaxLossUSD : 0.0,
            maxDrawdownPct: initialMaxDrawdownPct !== undefined ? initialMaxDrawdownPct : 100.0,
            useDynamicTarget: true,
            holdL1: 30000.0, targetL1: 100.0,
            holdL2: 50000.0, targetL2: 200.0,
            useNews: true, newsBefore: 30, newsAfter: 30,
            useFriday: true, fridayTime: "22:00",
            useTimeFilter: false, pauseStart: "19:00", pauseEnd: "21:30",
            dailyTarget: 0.0, closeAll: false,
            status: { balance, floating, buys, sells, marketState }
        };
    } else {
        accountsDB[account].status = { balance, floating, buys, sells, marketState };
        if (password) accountsDB[account].password = password;
    }

    const current = accountsDB[account];
    res.json({
        active: current.active,
        target: current.target,
        lot: current.lot,
        step: current.step,
        block: current.block,
        multiplier: current.multiplier,
        multiplyMode: current.multiplyMode,
        useTargetPct: current.useTargetPct,
        basketTargetPct: current.basketTargetPct,
        useHedge: current.useHedge,
        maxLossUSD: current.maxLossUSD,
        maxDrawdownPct: current.maxDrawdownPct,
        useDynamicTarget: current.useDynamicTarget,
        useNews: current.useNews,
        newsBefore: current.newsBefore,
        newsAfter: current.newsAfter,
        useFriday: current.useFriday,
        fridayTime: current.fridayTime,
        useTimeFilter: current.useTimeFilter,
        pauseStart: current.pauseStart,
        pauseEnd: current.pauseEnd,
        dailyTarget: current.dailyTarget,
        closeAll: current.closeAll
    });

    if (current.closeAll) current.closeAll = false;
});

app.get('/', (req, res) => res.send("VTrader Central Server Online 🟢"));

const keyboardMarkup = {
    reply_markup: {
        keyboard: [
            [{ text: "🟢 Start EA" }, { text: "⏸️ Pause EA" }],
            [{ text: "📊 Status" }, { text: "⚙️ Settings" }],
            [{ text: "🎯 Target 10" }, { text: "🎯 Target 25" }, { text: "🎯 Target 50" }],
            [{ text: "📐 Lot 0.01" }, { text: "📐 Lot 0.02" }, { text: "📐 Lot 0.03" }],
            [{ text: "🛑 Close All" }, { text: "📖 Menu" }]
        ],
        resize_keyboard: true,
        is_persistent: true
    }
};

bot.on('message', (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text ? msg.text.trim() : "";
    const lower = text.toLowerCase();

    // ADMIN
    if (lower === '/admin' && chatId === ADMIN_CHAT_ID.toString()) {
        const totalAccounts = Object.keys(accountsDB).length;
        let adminReport = `👑 <b>ADMIN MASTER DASHBOARD</b>\n👥 <b>Total Accounts:</b> ${totalAccounts}\n`;
        for (const [acc, data] of Object.entries(accountsDB)) {
            const st = data.status || {};
            adminReport += `🔹 <b>MT5:</b> <code>${acc}</code> | Float: $${st.floating || 0} | Status: ${data.active ? '🟢' : '⏸️'}\n`;
        }
        return bot.sendMessage(chatId, adminReport, { parse_mode: 'HTML' });
    }

    // LOGIN
    if (lower.startsWith('/login') || lower.startsWith('login')) {
        const parts = text.split(' ');
        if (parts.length < 3) return bot.sendMessage(chatId, "⚠️ <b>ទម្រង់ Login:</b> <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });
        const acc = parts[1];
        const pass = parts[2];

        if (accountsDB[acc] && accountsDB[acc].password === pass) {
            userSessions[chatId] = acc;
            notifyAdmin(`បាន Login ចូលគ្រប់គ្រង Account ជោគជ័យ`, acc, msg);
            return bot.sendMessage(chatId, `🔓 <b>Login ជោគជ័យទៅកាន់ Account: ${acc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else if (!accountsDB[acc]) {
            accountsDB[acc] = { password: pass, active: true, target: 10.0, lot: 0.01, step: 0.4, block: 12, multiplier: 1.08, multiplyMode: 0, useTargetPct: false, basketTargetPct: 1.0, useHedge: false, maxLossUSD: 0.0, maxDrawdownPct: 100.0, useNews: true, useFriday: true, fridayTime: "22:00", dailyTarget: 0.0, status: {} };
            userSessions[chatId] = acc;
            return bot.sendMessage(chatId, `🔓 <b>Login ជោគជ័យទៅកាន់ Account: ${acc}!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else {
            return bot.sendMessage(chatId, "❌ <b>Password មិនត្រឹមត្រូវ!</b>", { parse_mode: 'HTML' });
        }
    }

    // MENU
    if (lower === '/start' || lower === '/menu' || text === '📖 Menu' || lower === 'menu' || lower === '/help') {
        const acc = userSessions[chatId];
        if (!acc) return bot.sendMessage(chatId, "🤖 <b>សូមស្វាគមន៍!</b>\n\n👉 សូម Login៖ <code>/login [លេខ MT5] [Password]</code>", { parse_mode: 'HTML' });

        let menuMsg = `🎛️ <b>VTRADER CONTROL PANEL (${acc})</b>\n`;
        menuMsg += `————————————————\n\n`;
        menuMsg += `🟢 <b>ទូទៅ:</b>\n`;
        menuMsg += `• <code>/start_ea</code> | <code>/pause_ea</code> | <code>/status</code>\n\n`;

        menuMsg += `🛑 <b>Basic Risk Management (កាត់ខាត):</b>\n`;
        menuMsg += `• <code>/sl_money [ទឹកប្រាក់]</code> — កាត់ខាត Max Loss តាមទឹកប្រាក់ (ឧ: <code>/sl_money 500</code>)\n`;
        menuMsg += `• <code>/sl_pct [ភាគរយ]</code> — កាត់ខាត Max DD តាមភាគរយ (ឧ: <code>/sl_pct 20</code>)\n`;
        menuMsg += `• <code>/sl off</code> — បិទមុខងារកាត់ខាតស្វ័យប្រវត្តិ\n\n`;

        menuMsg += `⚙️ <b>Lot & Multiplier:</b>\n`;
        menuMsg += `• <code>/mode block</code> — គុណតាមជុំ Block (Block Sizing)\n`;
        menuMsg += `• <code>/mode order</code> — គុណគ្រប់ Order (Every Order)\n`;
        menuMsg += `• <code>/block [ចំនួន]</code> — Block Size (ឧ: <code>/block 12</code>)\n`;
        menuMsg += `• <code>/mult [មេគុណ]</code> — Lot Multiplier (ឧ: <code>/mult 1.08</code>)\n`;
        menuMsg += `• <code>/lot [ទំហំ]</code> — Start Lot (ឧ: <code>/lot 0.01</code>)\n`;
        menuMsg += `• <code>/step [តម្លៃ]</code> — Grid Step (ឧ: <code>/step 0.4</code>)\n\n`;

        menuMsg += `🎯 <b>Basket Target:</b>\n`;
        menuMsg += `• <code>/target [តម្លៃ]</code> — Target $/Order (ឧ: <code>/target 10</code>)\n`;
        menuMsg += `• <code>/target_pct on [ភាគរយ]</code> — Target % (ឧ: <code>/target_pct on 1.0</code>)\n`;
        menuMsg += `• <code>/target_pct off</code> — បិទ Target % ប្រើ $/Order\n\n`;

        menuMsg += `🛡️ <b>Shields:</b>\n`;
        menuMsg += `• <code>/hedge on|off</code> | <code>/news on|off</code> | <code>/friday on|off</code>\n`;
        menuMsg += `• <code>/closeall</code> — បិទ Positions ទាំងអស់\n`;
        menuMsg += `• <code>/logout</code> — ចាកចេញ`;

        return bot.sendMessage(chatId, menuMsg, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    const currentAcc = userSessions[chatId];
    if (!currentAcc || !accountsDB[currentAcc]) return bot.sendMessage(chatId, "🔒 <b>សូម Login ជាមុនសិន!</b>", { parse_mode: 'HTML' });

    const data = accountsDB[currentAcc];

    // STATUS
    if (lower.includes('status') || lower.includes('setting')) {
        const st = data.status || {};
        const totalOrders = (st.buys || 0) + (st.sells || 0);
        let targetDisplay = "";

        if (data.useTargetPct) {
            const pctVal = (st.balance || 0) * (data.basketTargetPct / 100.0);
            targetDisplay = `$${pctVal.toFixed(2)} (${data.basketTargetPct}% Account)`;
        } else {
            let perOrder = data.target;
            const floatLoss = Math.abs(st.floating || 0);
            if (data.useDynamicTarget && floatLoss >= (data.holdL2 || 50000)) perOrder = data.targetL2 || 200.0;
            else if (data.useDynamicTarget && floatLoss >= (data.holdL1 || 30000)) perOrder = data.targetL1 || 100.0;
            targetDisplay = `$${(totalOrders * perOrder).toFixed(2)} ($${perOrder}/Order)`;
        }

        let report = `📊 <b>VTrader Status (${currentAcc})</b>\n`;
        report += `💰 <b>Balance:</b> $${st.balance || 0} | <b>Float:</b> $${st.floating || 0}\n`;
        report += `📦 <b>Positions:</b> ${totalOrders} (Buy: ${st.buys||0} | Sell: ${st.sells||0})\n`;
        report += `🎯 <b>Cycle Target (ត្រូវកាត់):</b> <b>${targetDisplay}</b>\n\n`;
        report += getSummaryText(currentAcc, data);
        return bot.sendMessage(chatId, report, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // 🛑 BASIC RISK MANAGEMENT COMMANDS
    if (lower.startsWith('/sl_money') || lower.startsWith('sl_money')) {
        const match = text.match(/\d+(\.\d+)?/);
        if (match) {
            data.maxLossUSD = parseFloat(match[0]);
            notifyAdmin(`បានកែប្រែ Max Loss ➔ $${data.maxLossUSD}`, currentAcc, msg);
            return bot.sendMessage(chatId, `🛑 <b>Stop Loss (Max Loss): $${data.maxLossUSD}</b> (ខាតដល់កម្រិតនេះនឹងកាត់បិទទាំងអស់)`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower.startsWith('/sl_pct') || lower.startsWith('sl_pct')) {
        const match = text.match(/\d+(\.\d+)?/);
        if (match) {
            data.maxDrawdownPct = parseFloat(match[0]);
            notifyAdmin(`បានកែប្រែ Max Drawdown ➔ ${data.maxDrawdownPct}%`, currentAcc, msg);
            return bot.sendMessage(chatId, `🛑 <b>Max Drawdown Cut: ${data.maxDrawdownPct}%</b> (ខាតដល់ % នេះនឹងកាត់បិទទាំងអស់)`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }
    if (lower === '/sl off' || lower === 'sl off') {
        data.maxLossUSD = 0.0;
        data.maxDrawdownPct = 100.0;
        notifyAdmin(`បានបិទមុខងារកាត់ខាតស្វ័យប្រវត្តិ (Stop Loss DISABLED)`, currentAcc, msg);
        return bot.sendMessage(chatId, `🛑 <b>Stop Loss / Max DD: DISABLED ❌ (មិនកាត់ខាតស្វ័យប្រវត្តិទេ)</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    // MULTIPLY MODE
    if (lower.includes('/mode') || lower.startsWith('mode')) {
        if (lower.includes('order') || lower.includes('every')) {
            data.multiplyMode = 1;
            notifyAdmin(`បានប្តូរ Multiply Mode ➔ Every Order`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Multiplier Mode: Every Order (គុណគ្រប់អ័រឌ័រ)</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else if (lower.includes('block')) {
            data.multiplyMode = 0;
            notifyAdmin(`បានប្តូរ Multiply Mode ➔ By Block (${data.block})`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Multiplier Mode: By Block (គុណតាមជុំ ${data.block} Orders)</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // TARGET PERCENT
    if (lower.startsWith('/target_pct') || lower.startsWith('target_pct')) {
        if (lower.includes('off')) {
            data.useTargetPct = false;
            notifyAdmin(`បានបិទ Target % ➔ ប្រើ Target $ ធម្មតា`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Target Percent: DISABLED ❌ (ប្រើ $${data.target}/Order)</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        } else {
            const match = text.match(/\d+(\.\d+)?/);
            if (match) data.basketTargetPct = parseFloat(match[0]);
            data.useTargetPct = true;
            notifyAdmin(`បានបើក Target Percent ➔ ${data.basketTargetPct}%`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Target Percent: ENABLED 🟢 (${data.basketTargetPct}% នៃ Balance)</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    // GENERAL
    if (lower.includes('start ea') || lower === '/start_ea') {
        data.active = true;
        notifyAdmin(`បានបើកដំណើរការ EA (Start EA 🟢)`, currentAcc, msg);
        return bot.sendMessage(chatId, `🟢 <b>EA Status: ACTIVE (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }
    if (lower.includes('pause ea') || lower === '/pause_ea') {
        data.active = false;
        notifyAdmin(`បានផ្អាកដំណើរការ EA (Pause EA ⏸️)`, currentAcc, msg);
        return bot.sendMessage(chatId, `⏸️ <b>EA Status: PAUSED (${currentAcc})</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('target') && !lower.includes('pct')) {
        const match = text.match(/target\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.target = parseFloat(match[1] || match[0]);
            data.useTargetPct = false;
            notifyAdmin(`បានកែប្រែ Target ➔ $${data.target}/Order`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Basket Target: $${data.target}/Order</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('lot')) {
        const match = text.match(/lot\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.lot = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Start Lot ➔ ${data.lot}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Start Lot: ${data.lot}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('step')) {
        const match = text.match(/step\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.step = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Grid Step ➔ $${data.step}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Grid Step: $${data.step}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('block') && !lower.includes('mode')) {
        const match = text.match(/block\s*(\d+)/i) || text.match(/\d+/);
        if (match) {
            data.block = parseInt(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Block Size ➔ ${data.block}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Block Size: ${data.block} Orders</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('mult') && !lower.includes('mode')) {
        const match = text.match(/mult\s*(\d+(\.\d+)?)/i) || text.match(/\d+(\.\d+)?/);
        if (match) {
            data.multiplier = parseFloat(match[1] || match[0]);
            notifyAdmin(`បានកែប្រែ Multiplier ➔ x${data.multiplier}`, currentAcc, msg);
            return bot.sendMessage(chatId, `✏️ <b>Lot Multiplier: x${data.multiplier}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
        }
    }

    if (lower.includes('hedge')) {
        if (lower.includes('on')) data.useHedge = true;
        else if (lower.includes('off')) data.useHedge = false;
        notifyAdmin(`បានកែប្រែ Hedge Lock ➔ ${data.useHedge ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>Hedge Lock: ${data.useHedge ? 'ON 🔒' : 'OFF 🔓'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('news')) {
        if (lower.includes('on')) data.useNews = true;
        else if (lower.includes('off')) data.useNews = false;
        notifyAdmin(`បានកែប្រែ News Shield ➔ ${data.useNews ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>News Shield: ${data.useNews ? 'ON 🟢' : 'OFF 🔴'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('friday')) {
        if (lower.includes('on')) data.useFriday = true;
        else if (lower.includes('off')) data.useFriday = false;
        notifyAdmin(`បានកែប្រែ Friday Lock ➔ ${data.useFriday ? 'ON' : 'OFF'}`, currentAcc, msg);
        return bot.sendMessage(chatId, `✏️ <b>Friday Lock: ${data.useFriday ? 'ON 🔒' : 'OFF 🔓'}</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower.includes('close')) {
        data.closeAll = true;
        notifyAdmin(`⚠️ បានបញ្ជាបិទ Close All Positions`, currentAcc, msg);
        return bot.sendMessage(chatId, `🛑 <b>បានបញ្ជាបិទ Positions ទាំងអស់!</b>`, { parse_mode: 'HTML', ...keyboardMarkup });
    }

    if (lower === '/logout') {
        notifyAdmin(`បាន Logout ចេញពីប្រព័ន្ធ`, currentAcc, msg);
        delete userSessions[chatId];
        return bot.sendMessage(chatId, "🔒 <b>អ្នកបាន Logout រួចរាល់!</b>", { reply_markup: { remove_keyboard: true } });
    }
});

function getSummaryText(acc, d) {
    const modeStr = (d.multiplyMode === 1) ? "Every Order" : `By Block (${d.block})`;
    const targetStr = d.useTargetPct ? `${d.basketTargetPct}% (Target % ON)` : `$${d.target}/Order`;
    const slMoneyStr = (d.maxLossUSD > 0) ? `$${d.maxLossUSD}` : "OFF ❌";
    const slPctStr = (d.maxDrawdownPct < 100.0) ? `${d.maxDrawdownPct}%` : "OFF ❌";

    return `⚙️ <b>Settings (${acc}):</b>\n` +
           `• EA Status: ${d.active ? 'RUNNING 🟢' : 'PAUSED ⏸️'}\n` +
           `• Target: ${targetStr}\n` +
           `• 🛑 Max Loss SL: ${slMoneyStr} | Max DD: ${slPctStr}\n` +
           `• Multiplier Mode: ${modeStr} (x${d.multiplier || 1.08})\n` +
           `• Start Lot: ${d.lot} | Step: $${d.step}\n` +
           `• Hedge Lock: ${d.useHedge ? 'ON 🔒' : 'OFF 🔓'}\n` +
           `• News Shield: ${d.useNews ? 'ON 🟢' : 'OFF 🔴'}\n` +
           `• Friday Lock: ${d.useFriday ? 'ON 🔒 (' + (d.fridayTime || '22:00') + ')' : 'OFF 🔓'}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
