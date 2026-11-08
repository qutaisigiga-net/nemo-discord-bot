const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');

// ოპციონალური: lvl ბარათის სურათისთვის -> npm i @napi-rs/canvas
let canvasLib = null;
try { canvasLib = require('@napi-rs/canvas'); } catch (e) { console.log('ℹ️ @napi-rs/canvas არ არის დაინსტალირებული, /ns lvl გამოიყენებს embed-ს'); }

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const DB_FILE = './database.json';

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading database:', err);
    }
    return { balances: {}, xp: {}, levels: {}, vips: {} };
}

function saveDatabase() {
    try {
        const data = {
            balances: userBalances,
            xp: userXP,
            levels: userLevel,
            vips: activeVips
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving database:', err);
    }
}

const db = loadDatabase();
const userBalances = db.balances || {};
const userXP = db.xp || {};
const userLevel = db.levels || {};
const activeVips = db.vips || {};

const userCooldowns = {};
const PREFIX = '/ns';

let currentEvent = null;

// ===== დამხმარე ფუნქციები =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ამატებს XP-ს და ამოწმებს ლეველაპს. აბრუნებს true-ს თუ ლეველი აიწია
function addXP(userId, amount) {
    userXP[userId] += amount;
    const required = userLevel[userId] * 2500;
    if (userXP[userId] >= required) {
        userLevel[userId] += 1;
        userBalances[userId] += 100000;
        return true;
    }
    return false;
}

// მაღაზიის ბაზა
const shopRoles = {
    '1': { roleId: '1558406478874935319', name: 'მისიონერი', price: 2000000 },
    '2': { roleId: '1558946730911866920', name: 'Luxury', price: 50000000 },
    '3': { roleId: '1558959012693676052', name: 'ოლიმპასკი', price: 80000000 },
    '4': { roleId: '1558976319470051358', name: 'პაეგერნაუტო', price: 150000000 },
    '5': { roleId: '1559177620132724768', name: 'LONGEER', price: 1000000000 },
    '01': { roleId: '1559178826695581767', name: '| VIP | BRONZE', price: 10000000, isVip: true, days: 2 },
    '02': { roleId: '1559178938792677396', name: '| VIP | GOLD', price: 50000000, isVip: true, days: 4 },
    '03': { roleId: '1559179060897128469', name: '| VIP | PREMUME', price: 100000000, isVip: true, days: 7 }
};

function makeUncopyable(text) {
    return text.split('').join('\u200B');
}

// ===== OwO სტილის LVL ბარათი =====
async function buildLevelCard(target, lvl, xp, nextXp, rank) {
    const { createCanvas, loadImage } = canvasLib;
    const W = 800, H = 260;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ფონი
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1e1f2e');
    bg.addColorStop(1, '#2b2d42');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ავატარი (წრეში)
    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(130, 130, 80, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 50, 50, 160, 160);
    ctx.restore();
    ctx.strokeStyle = '#7289da';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(130, 130, 83, 0, Math.PI * 2);
    ctx.stroke();

    // ტექსტი
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(target.username.slice(0, 20), 250, 90);

    ctx.fillStyle = '#a5b4fc';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`LEVEL ${lvl}`, 250, 135);

    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'right';
    ctx.fillText(`RANK #${rank}`, W - 40, 135);
    ctx.textAlign = 'left';

    // პროგრეს ბარი
    const barX = 250, barY = 160, barW = 510, barH = 34;
    ctx.fillStyle = '#3a3d55';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 17);
    ctx.fill();

    const pct = Math.min(Math.max(xp / nextXp, 0), 1);
    if (pct > 0) {
        const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        fillGrad.addColorStop(0, '#6366f1');
        fillGrad.addColorStop(1, '#22d3ee');
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, Math.max(barW * pct, 34), barH, 17);
        ctx.fill();
    }

    ctx.fillStyle = '#d1d5db';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${xp.toLocaleString()} / ${nextXp.toLocaleString()} XP`, barX + barW, 225);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

// ===== CASH ბარათი =====
async function buildCashCard(target, bal, rank) {
    const { createCanvas, loadImage } = canvasLib;
    const W = 800, H = 260;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f2027');
    bg.addColorStop(0.5, '#1b3a3a');
    bg.addColorStop(1, '#203a2f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // დეკორატიული წრეები
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(720, 40, 120, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(640, 250, 80, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ავატარი
    const avatar = await loadImage(target.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.save();
    ctx.beginPath(); ctx.arc(120, 130, 70, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(avatar, 50, 60, 140, 140);
    ctx.restore();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(120, 130, 73, 0, Math.PI * 2); ctx.stroke();

    // სახელი
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(target.username.slice(0, 20), 220, 80);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '20px sans-serif';
    ctx.fillText('BALANCE', 220, 125);

    // მონეტის აიკონი
    const coinGrad = ctx.createLinearGradient(220, 140, 260, 190);
    coinGrad.addColorStop(0, '#fde68a');
    coinGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = coinGrad;
    ctx.beginPath(); ctx.arc(245, 168, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#92400e';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 245, 178);
    ctx.textAlign = 'left';

    // თანხა
    const text = bal.toLocaleString('en-US');
    ctx.fillStyle = '#fbbf24';
    ctx.font = text.length > 14 ? 'bold 40px sans-serif' : 'bold 50px sans-serif';
    ctx.fillText(text, 285, 187);

    // რანკი
    ctx.fillStyle = '#d1d5db';
    ctx.font = '22px sans-serif';
    ctx.fillText(`WEALTH RANK  #${rank}`, 220, 232);

    return canvas.toBuffer('image/png');
}

// <CARDS_START>
// ===== CANVAS UI (ყველა ბარათი) =====
const fmt = (n) => Number(n).toLocaleString('en-US');

async function tryCard(fn, name = 'card.png') {
    if (!canvasLib) return null;
    try { return new AttachmentBuilder(await fn(), { name }); }
    catch (e) { console.error('Card error:', e.message); return null; }
}

async function getUser(id) {
    return client.users.cache.get(id) || (await client.users.fetch(id).catch(() => null));
}

function newCanvas(w, h, c1, c2) {
    const canvas = canvasLib.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx };
}

function box(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
}

function txt(ctx, s, x, y, font, color, align = 'left') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
    ctx.textAlign = 'left';
}

async function drawAvatar(ctx, user, cx, cy, r, ring) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    try {
        const img = await canvasLib.loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } catch (e) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        txt(ctx, (user.username || '?')[0].toUpperCase(), cx, cy + r / 3, `bold ${Math.round(r)}px sans-serif`, '#fff', 'center');
    }
    ctx.restore();
    if (ring) {
        ctx.strokeStyle = ring; ctx.lineWidth = Math.max(3, r / 12);
        ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
}

function coinIcon(ctx, cx, cy, r, label = '$') {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#d97706');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b45309'; ctx.lineWidth = Math.max(2, r / 9);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    txt(ctx, label, cx, cy + r * 0.38, `bold ${Math.round(r * 1.1)}px sans-serif`, '#92400e', 'center');
}

function xpBar(ctx, x, y, w, h, pct) {
    box(ctx, x, y, w, h, h / 2, '#3a3d55');
    if (pct > 0) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#6366f1'); g.addColorStop(1, '#22d3ee');
        box(ctx, x, y, Math.max(w * Math.min(pct, 1), h), h, h / 2, g);
    }
}

// --- PROFILE (/ns stat) ---
async function cardProfile(user, bal, lvl, xp, nextXp, rank) {
    const { canvas, ctx } = newCanvas(800, 300, '#1e1f2e', '#2b2d42');
    await drawAvatar(ctx, user, 120, 120, 75, '#7289da');
    txt(ctx, user.username.slice(0, 20), 230, 80, 'bold 36px sans-serif', '#fff');
    box(ctx, 230, 100, 150, 40, 20, '#4f46e5');
    txt(ctx, `LEVEL ${lvl}`, 305, 128, 'bold 22px sans-serif', '#fff', 'center');
    box(ctx, 395, 100, 130, 40, 20, '#b45309');
    txt(ctx, `RANK #${rank}`, 460, 128, 'bold 22px sans-serif', '#fff', 'center');
    coinIcon(ctx, 252, 190, 22);
    txt(ctx, fmt(bal), 288, 200, 'bold 36px sans-serif', '#fbbf24');
    xpBar(ctx, 40, 250, 720, 26, xp / nextXp);
    txt(ctx, `${fmt(xp)} / ${fmt(nextXp)} XP`, 760, 238, '20px sans-serif', '#d1d5db', 'right');
    return canvas.toBuffer('image/png');
}

// --- COINFLIP ---
async function cardCoin(user, bet, win, bal, xpGain) {
    const c1 = win ? '#052e16' : '#2e0a0a', c2 = win ? '#14532d' : '#7f1d1d';
    const { canvas, ctx } = newCanvas(800, 260, c1, c2);
    // დიდი მონეტა
    coinIcon(ctx, 130, 130, 85, win ? 'H' : 'T');
    txt(ctx, win ? 'HEADS' : 'TAILS', 130, 245, 'bold 20px sans-serif', '#fde68a', 'center');
    txt(ctx, win ? 'YOU WON' : 'YOU LOST', 260, 85, 'bold 48px sans-serif', win ? '#4ade80' : '#f87171');
    txt(ctx, `${win ? '+' : '-'}${fmt(bet)}`, 260, 145, 'bold 44px sans-serif', '#fbbf24');
    txt(ctx, `Balance: ${fmt(bal)}   |   +${xpGain} XP`, 260, 190, '24px sans-serif', '#e5e7eb');
    txt(ctx, user.username.slice(0, 24), 260, 230, '20px sans-serif', '#9ca3af');
    return canvas.toBuffer('image/png');
}

// --- SLOTS ---
function drawSym(ctx, i, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); ctx.lineCap = 'round'; ctx.lineWidth = 5;
    const circ = (x, y, r, f) => { ctx.fillStyle = f; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    if (i === 0) { // cherry
        ctx.strokeStyle = '#4ade80'; ctx.beginPath();
        ctx.moveTo(-18, 12); ctx.quadraticCurveTo(-8, -25, 12, -40);
        ctx.moveTo(18, 16); ctx.quadraticCurveTo(15, -20, 12, -40); ctx.stroke();
        circ(-20, 22, 17, '#ef4444'); circ(20, 24, 17, '#dc2626');
        circ(-25, 16, 4, '#fecaca'); circ(15, 18, 4, '#fecaca');
    } else if (i === 1) { // lemon
        ctx.fillStyle = '#facc15'; ctx.rotate(-0.3);
        ctx.beginPath(); ctx.ellipse(0, 0, 40, 27, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(-36, -6); ctx.lineTo(-36, 6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(36, -6); ctx.lineTo(36, 6); ctx.fill();
        ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.ellipse(-8, -9, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (i === 2) { // grapes
        ctx.strokeStyle = '#4ade80'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(4, -44); ctx.stroke();
        [[-22, -22], [0, -22], [22, -22], [-11, -2], [11, -2], [0, 18]].forEach(([x, y]) => circ(x, y + 8, 14, '#a855f7'));
        circ(-4, -18, 4, '#e9d5ff');
    } else if (i === 3) { // bell
        ctx.fillStyle = '#fbbf24'; ctx.beginPath();
        ctx.moveTo(-36, 24); ctx.quadraticCurveTo(-36, -34, 0, -34); ctx.quadraticCurveTo(36, -34, 36, 24);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(-42, 20, 84, 10);
        circ(0, 38, 8, '#b45309'); circ(0, -38, 6, '#fbbf24');
    } else if (i === 4) { // diamond
        ctx.fillStyle = '#22d3ee'; ctx.beginPath();
        ctx.moveTo(-36, -10); ctx.lineTo(-18, -32); ctx.lineTo(18, -32); ctx.lineTo(36, -10); ctx.lineTo(0, 38); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#cffafe'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(-36, -10); ctx.lineTo(36, -10); ctx.moveTo(-18, -32); ctx.lineTo(-8, -10); ctx.lineTo(0, 38);
        ctx.moveTo(18, -32); ctx.lineTo(8, -10); ctx.lineTo(0, 38); ctx.stroke();
    } else { // seven
        ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = '#7f1d1d'; ctx.strokeText('7', 0, 32);
        ctx.fillStyle = '#ef4444'; ctx.fillText('7', 0, 32);
    }
    ctx.restore();
}

async function cardSlots(user, idx, win, amount, bal, xpGain) {
    const { canvas, ctx } = newCanvas(800, 340, '#1a1033', '#3b0764');
    txt(ctx, 'NEMO SLOTS', 400, 50, 'bold 34px sans-serif', '#fbbf24', 'center');
    for (let i = 0; i < 3; i++) {
        const x = 130 + i * 190;
        box(ctx, x, 75, 160, 140, 20, '#0f0a1f');
        ctx.strokeStyle = win ? '#4ade80' : '#6b7280'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(x, 75, 160, 140, 20); ctx.stroke();
        drawSym(ctx, idx[i], x + 80, 145);
    }
    txt(ctx, win ? `YOU WON +${fmt(amount)}` : `YOU LOST -${fmt(amount)}`, 400, 262, 'bold 38px sans-serif', win ? '#4ade80' : '#f87171', 'center');
    txt(ctx, `${user.username.slice(0, 20)}   |   Balance: ${fmt(bal)}   |   +${xpGain} XP`, 400, 305, '22px sans-serif', '#d1d5db', 'center');
    return canvas.toBuffer('image/png');
}

// --- LEADERBOARD (/ns top) ---
async function cardTop(title, rows) {
    const rowH = 56, H = 110 + Math.max(rows.length, 1) * rowH + 20;
    const { canvas, ctx } = newCanvas(800, H, '#111827', '#1f2937');
    txt(ctx, title, 400, 62, 'bold 38px sans-serif', '#fbbf24', 'center');
    const medal = ['#fbbf24', '#cbd5e1', '#d97706'];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i], y = 100 + i * rowH;
        box(ctx, 30, y, 740, rowH - 8, 14, i < 3 ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.05)');
        txt(ctx, `#${i + 1}`, 70, y + 33, 'bold 26px sans-serif', medal[i] || '#9ca3af', 'center');
        await drawAvatar(ctx, r.user || { username: '?', displayAvatarURL: () => '' }, 130, y + 20, 18, medal[i]);
        txt(ctx, (r.name || 'Unknown').slice(0, 22), 165, y + 31, '24px sans-serif', '#f3f4f6');
        txt(ctx, r.value, 750, y + 31, 'bold 24px sans-serif', '#fbbf24', 'right');
    }
    if (!rows.length) txt(ctx, 'No data yet', 400, 160, '26px sans-serif', '#9ca3af', 'center');
    return canvas.toBuffer('image/png');
}

// --- DAILY ---
async function cardDaily(user, money, xp, bal) {
    const { canvas, ctx } = newCanvas(800, 240, '#022c22', '#064e3b');
    await drawAvatar(ctx, user, 110, 120, 65, '#34d399');
    txt(ctx, 'DAILY REWARD', 210, 80, 'bold 38px sans-serif', '#6ee7b7');
    coinIcon(ctx, 232, 135, 24);
    txt(ctx, `+${fmt(money)}`, 270, 147, 'bold 40px sans-serif', '#fbbf24');
    txt(ctx, `+${xp} XP`, 560, 147, 'bold 34px sans-serif', '#67e8f9');
    txt(ctx, `Balance: ${fmt(bal)}`, 210, 200, '24px sans-serif', '#d1fae5');
    return canvas.toBuffer('image/png');
}

// --- PAY ---
async function cardPay(from, to, amount) {
    const { canvas, ctx } = newCanvas(800, 260, '#0c1a2e', '#1e3a5f');
    await drawAvatar(ctx, from, 120, 110, 60, '#60a5fa');
    await drawAvatar(ctx, to, 680, 110, 60, '#34d399');
    txt(ctx, from.username.slice(0, 14), 120, 205, '22px sans-serif', '#e5e7eb', 'center');
    txt(ctx, to.username.slice(0, 14), 680, 205, '22px sans-serif', '#e5e7eb', 'center');
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(220, 130); ctx.lineTo(580, 130); ctx.moveTo(550, 105); ctx.lineTo(580, 130); ctx.lineTo(550, 155); ctx.stroke();
    coinIcon(ctx, 290, 85, 20);
    txt(ctx, fmt(amount), 330, 97, 'bold 38px sans-serif', '#fbbf24');
    txt(ctx, 'TRANSFER COMPLETE', 400, 245, 'bold 20px sans-serif', '#93c5fd', 'center');
    return canvas.toBuffer('image/png');
}

// --- DUEL ---
async function cardDuel(winner, loser, bet, xpGain) {
    const { canvas, ctx } = newCanvas(800, 300, '#1c1917', '#44251a');
    await drawAvatar(ctx, winner, 170, 120, 75, '#fbbf24');
    ctx.globalAlpha = 0.55;
    await drawAvatar(ctx, loser, 630, 120, 75, '#6b7280');
    ctx.globalAlpha = 1;
    txt(ctx, 'VS', 400, 135, 'bold 56px sans-serif', '#f97316', 'center');
    box(ctx, 105, 205, 130, 34, 17, '#fbbf24');
    txt(ctx, 'WINNER', 170, 229, 'bold 20px sans-serif', '#78350f', 'center');
    txt(ctx, winner.username.slice(0, 14), 170, 268, '22px sans-serif', '#fff', 'center');
    txt(ctx, loser.username.slice(0, 14), 630, 268, '22px sans-serif', '#9ca3af', 'center');
    txt(ctx, `+${fmt(bet)}  |  +${xpGain} XP`, 400, 215, 'bold 26px sans-serif', '#fbbf24', 'center');
    return canvas.toBuffer('image/png');
}

// --- LEVEL UP ---
async function cardLevelUp(user, lvl) {
    const { canvas, ctx } = newCanvas(800, 220, '#312e81', '#6d28d9');
    await drawAvatar(ctx, user, 110, 110, 70, '#fbbf24');
    txt(ctx, 'LEVEL UP!', 215, 85, 'bold 50px sans-serif', '#fde68a');
    txt(ctx, `${user.username.slice(0, 18)}  reached  LEVEL ${lvl}`, 215, 130, '26px sans-serif', '#fff');
    coinIcon(ctx, 235, 177, 18);
    txt(ctx, '+100,000 coins', 265, 186, 'bold 26px sans-serif', '#fbbf24');
    return canvas.toBuffer('image/png');
}

async function announceLevelUp(channel, user, lvl) {
    const f = await tryCard(() => cardLevelUp(user, lvl), 'levelup.png');
    if (f) return channel.send({ content: `${user}`, files: [f] }).catch(() => {});
    return channel.send(`🎉 **LEVEL UP!** გილოცავ ${user}! შენ გადახვედი **${lvl}** ლეველზე და საჩუქრად დაგერიცხა **100,000** ქოინი! 💰⭐`).catch(() => {});
}
// <CARDS_END>

client.on('ready', () => {
    console.log(`🤖 Bot is online as ${client.user.tag}`);

    setInterval(async () => {
        const now = Date.now();
        let changed = false;

        for (const [userId, vipData] of Object.entries(activeVips)) {
            if (now >= vipData.expiresAt) {
                try {
                    const guild = client.guilds.cache.first();
                    if (guild) {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member) {
                            await member.roles.remove(vipData.roleId).catch(() => {});
                            await member.send(`⏰ შენი VIP როლის ვადა ამოიწურა და ავტომატურად მოგეხსნა!`).catch(() => {});
                        }
                    }
                } catch (e) {
                    console.error('VIP removal error:', e);
                }
                delete activeVips[userId];
                changed = true;
            }
        }

        if (changed) saveDatabase();
    }, 60 * 1000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    if (!userBalances[userId]) userBalances[userId] = 1000;
    if (!userXP[userId]) userXP[userId] = 0;
    if (!userLevel[userId]) userLevel[userId] = 1;

    // ივენთის შემოწმება
    if (currentEvent && message.channel.id === currentEvent.channelId) {
        if (message.content === currentEvent.word) {
            const prize = currentEvent.prize;
            userBalances[userId] += prize;
            currentEvent = null;
            saveDatabase();

            const winEmbed = new EmbedBuilder()
                .setTitle('🎉 EVENT WINNER!')
                .setColor('#22c55e')
                .setDescription(`გილოცავ ${message.author}! შენ პირველმა ჩაწერე სწორი სიტყვა და მოიგე **${prize.toLocaleString()}** ქოინი! 💰✨`)
                .setTimestamp();

            return message.reply({ embeds: [winEmbed] });
        }
    }

    if (!message.content.toLowerCase().startsWith(PREFIX)) {
        if (addXP(userId, Math.floor(Math.random() * 3) + 1)) {
            announceLevelUp(message.channel, message.author, userLevel[userId]);
        }
        saveDatabase();
        return;
    }

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    if (addXP(userId, Math.floor(Math.random() * 4) + 2)) {
        announceLevelUp(message.channel, message.author, userLevel[userId]);
    }

    saveDatabase();

    // 1a. /ns stat (embed)
    if (command === 'stat' || command === 'profile') {
        const target = message.mentions.users.first() || message.author;
        const targetId = target.id;

        const bal = userBalances[targetId] || 1000;
        const xp = userXP[targetId] || 0;
        const lvl = userLevel[targetId] || 1;
        const nextXp = lvl * 2500;

        const sortedUsers = Object.entries(userXP).sort((a, b) => b[1] - a[1]);
        const rankIndex = sortedUsers.findIndex(([id]) => id === targetId);
        const rank = rankIndex !== -1 ? rankIndex + 1 : sortedUsers.length + 1;

        const progressPercent = Math.min(Math.max(xp / nextXp, 0), 1);
        const filledBlocks = Math.round(progressPercent * 15);
        const emptyBlocks = 15 - filledBlocks;
        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        const pf = await tryCard(() => cardProfile(target, bal, lvl, xp, nextXp, rank), 'profile.png');
        if (pf) return message.reply({ files: [pf] });

        const profileEmbed = new EmbedBuilder()
            .setColor('#7289da')
            .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) })
            .setDescription(
                `⭐ **LVL:** \`${lvl}\` | 🏆 **Rank:** \`#${rank}\`\n` +
                `💰 **ბალანსი:** \`${bal.toLocaleString()}\` ქოინი\n\n` +
                `📊 **XP:** \`${xp.toLocaleString()} / ${nextXp.toLocaleString()}\`\n` +
                `\`${progressBar}\``
            )
            .setTimestamp();

        return message.reply({ embeds: [profileEmbed] });
    }

    // 1b. /ns lvl (OwO სტილი: სურათის ბარათი, fallback - embed)
    if (command === 'lvl' || command === 'level') {
        const target = message.mentions.users.first() || message.author;
        const targetId = target.id;

        const xp = userXP[targetId] || 0;
        const lvl = userLevel[targetId] || 1;
        const nextXp = lvl * 2500;

        const sortedUsers = Object.entries(userXP).sort((a, b) => b[1] - a[1]);
        const rankIndex = sortedUsers.findIndex(([id]) => id === targetId);
        const rank = rankIndex !== -1 ? rankIndex + 1 : sortedUsers.length + 1;

        if (canvasLib) {
            try {
                const buffer = await buildLevelCard(target, lvl, xp, nextXp, rank);
                const file = new AttachmentBuilder(buffer, { name: 'level.png' });
                return message.reply({ files: [file] });
            } catch (err) {
                console.error('Level card error:', err);
            }
        }

        const pct = Math.min(Math.max(xp / nextXp, 0), 1);
        const filled = Math.round(pct * 20);
        const bar = '▰'.repeat(filled) + '▱'.repeat(20 - filled);
        const lvlEmbed = new EmbedBuilder()
            .setColor('#7289da')
            .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTitle(`LEVEL ${lvl}  •  RANK #${rank}`)
            .setDescription(`\`${bar}\`\n**${xp.toLocaleString()}** / **${nextXp.toLocaleString()}** XP (${Math.floor(pct * 100)}%)`);

        return message.reply({ embeds: [lvlEmbed] });
    }

    // 1c. /ns cash (canvas ბარათი, fallback - embed)
    if (command === 'cash' || command === 'balance' || command === 'bal' || command === 'money') {
        const target = message.mentions.users.first() || message.author;
        const targetId = target.id;
        const bal = userBalances[targetId] ?? 1000;

        const sortedBal = Object.entries(userBalances).sort((a, b) => b[1] - a[1]);
        const rankIndex = sortedBal.findIndex(([id]) => id === targetId);
        const rank = rankIndex !== -1 ? rankIndex + 1 : sortedBal.length + 1;

        if (canvasLib) {
            try {
                const buffer = await buildCashCard(target, bal, rank);
                const file = new AttachmentBuilder(buffer, { name: 'cash.png' });
                return message.reply({ files: [file] });
            } catch (err) {
                console.error('Cash card error:', err);
            }
        }

        const cashEmbed = new EmbedBuilder()
            .setColor('#fbbf24')
            .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) })
            .setDescription(`💰 **ბალანსი:** \`${bal.toLocaleString()}\` ქოინი\n🏆 **რანკი:** \`#${rank}\``);
        return message.reply({ embeds: [cashEmbed] });
    }

    // 2. /ns shop
    if (command === 'shop') {
        const shopEmbed = new EmbedBuilder()
            .setTitle('🛒 NEMO SHOP — მაღაზია')
            .setColor('#ffd700')
            .setDescription(
                `🎭 **როლები:** (\`/ns buy <ID>\`)\n` +
                `<@&1558406478874935319> — **2M** (ID: \`1\`)\n` +
                `<@&1558946730911866920> — **50M** (ID: \`2\`)\n` +
                `<@&1558959012693676052> — **80M** (ID: \`3\`)\n` +
                `<@&1558976319470051358> — **150M** (ID: \`4\`)\n` +
                `<@&1559177620132724768> — **1B** (ID: \`5\`)\n\n` +

                `👑 **VIP როლები:** (\`/ns buy <ID>\`)\n` +
                `<@&1559178826695581767> — **10M** (ID: \`01\`)\n` +
                `<@&1559178938792677396> — **50M** (ID: \`02\`)\n` +
                `<@&1559179060897128469> — **100M** (ID: \`03\`)`
            );

        return message.reply({ embeds: [shopEmbed] });
    }

    // 3. /ns buy
    if (command === 'buy') {
        const itemId = args[0];
        if (!itemId || !shopRoles[itemId]) {
            return message.reply('❌ მიუთითე ნივთის/როლის ID მაღაზიიდან!');
        }

        const item = shopRoles[itemId];

        if (item.isVip) {
            if (userBalances[userId] < item.price) {
                return message.reply(`❌ არ გაქვს საკმარისი ქოინები! გჭირდება **${item.price.toLocaleString()}** ქოინი.`);
            }

            userBalances[userId] -= item.price;
            const now = Date.now();
            const expiresAt = now + (item.days * 24 * 60 * 60 * 1000);

            activeVips[userId] = {
                roleId: item.roleId,
                expiresAt: expiresAt
            };
            saveDatabase();

            try {
                await message.member.roles.add(item.roleId);
                return message.reply(`👑 **გილოცავ!** შენ წარმატებით გააქტიურე **${item.name}** **${item.days}** დღით!`);
            } catch (err) {
                return message.reply('❌ ბოტს არ აქვს უფლება ამ როლის მისანიჭებლად!');
            }
        } else {
            if (userBalances[userId] < item.price) {
                return message.reply(`❌ არ გაქვს საკმარისი ქოინები! გჭირდება **${item.price.toLocaleString()}** ქოინი.`);
            }

            userBalances[userId] -= item.price;
            saveDatabase();

            try {
                await message.member.roles.add(item.roleId);
                return message.reply(`🎉 წარმატებით იყიდე როლი **${item.name}**!`);
            } catch (err) {
                return message.reply('❌ ბოტს არ აქვს საკმარისი უფლება ამ როლის მისანიჭებლად!');
            }
        }
    }

    // 4. /ns xpzero @user <XP>
    if (command === 'xpzero') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ მხოლოდ ადმინისტრატორებს აქვთ ამის უფლება!');
        }

        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!target || isNaN(amount) || amount <= 0) {
            return message.reply('❌ გამოიყენე: `/ns xpzero @user <XP>`');
        }

        if (!userXP[target.id]) userXP[target.id] = 0;
        if (!userLevel[target.id]) userLevel[target.id] = 1;

        userXP[target.id] -= amount;

        while (userXP[target.id] < 0 && userLevel[target.id] > 1) {
            userLevel[target.id] -= 1;
            const prevLevelMaxXP = userLevel[target.id] * 2500;
            userXP[target.id] += prevLevelMaxXP;
        }

        if (userXP[target.id] < 0) {
            userXP[target.id] = 0;
        }

        saveDatabase();

        return message.reply(`📉 ${target}-ს ჩამოეჭრა **${amount.toLocaleString()} XP**!\n📊 ახალი სტატუსი: **LVL ${userLevel[target.id]}** (${userXP[target.id].toLocaleString()} XP).`);
    }

    // 5. /ns event
    if (command === 'event') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ მხოლოდ ადმინისტრატორებისთვის!');
        }

        const prize = parseInt(args[0]);
        const word = args[1];

        if (!prize || isNaN(prize) || prize <= 0 || !word) {
            return message.reply('❌ გამოიყენე: `/ns event <თანხა> <სიტყვა>`');
        }

        currentEvent = { prize: prize, word: word, channelId: message.channel.id };
        const uncopyableWord = makeUncopyable(word);

        const eventEmbed = new EmbedBuilder()
            .setTitle('🎁 სწრაფი ივენთი დაიწყო!')
            .setColor('#eab308')
            .setDescription(
                `⚡ **ვინც პირველი ჩაწერს ჩატში ზუსტად ამ სიტყვას, მოიგებს ${prize.toLocaleString()} ქოინს!**\n\n` +
                `👉 საძიებო სიტყვა: **\`${uncopyableWord}\`**\n\n` +
                `⚠️ *ყურადღება: სიტყვის დაკოპირება არ იმუშავებს! აკრიფეთ ხელით!*`
            )
            .setFooter({ text: 'NEMO Event System' })
            .setTimestamp();

        return message.channel.send({ embeds: [eventEmbed] });
    }

    // 6. /ns drop
    if (command === 'drop') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ მხოლოდ ადმინისტრატორებისთვის!');
        }

        const type = args[0]?.toLowerCase();
        const value = args[1];

        if (!type || !value) {
            return message.reply('❌ გამოიყენე: `/ns drop <money/xp/role> <რაოდენობა/ID>`');
        }

        let descText = '';

        if (type === 'money') {
            const amt = parseInt(value);
            if (isNaN(amt) || amt <= 0) return message.reply('❌ მიუთითე ფულის სწორი რაოდენობა!');
            descText = `💰 **საჩუქარი:** **${amt.toLocaleString()}** ქოინი!`;
        } else if (type === 'xp') {
            const amt = parseInt(value);
            if (isNaN(amt) || amt <= 0) return message.reply('❌ მიუთითე XP-ს სწორი რაოდენობა!');
            descText = `⭐ **საჩუქარი:** **${amt.toLocaleString()}** მოთამაშის XP!`;
        } else if (type === 'role') {
            if (!shopRoles[value]) {
                return message.reply('❌ ასეთი როლის ID არ არსებობს!');
            }
            descText = `👑 **საჩუქარი:** როლი **${shopRoles[value].name}**!`;
        } else {
            return message.reply('❌ ტიპი უნდა იყოს: `money`, `xp` ან `role`!');
        }

        const dropEmbed = new EmbedBuilder()
            .setTitle('🎁 საიდუმლო ყუთი (DROP) გამოჩნდა!')
            .setColor('#00ffcc')
            .setDescription(`ვინც პირველი დააჭერს ქვემოთ მოცემულ ღილაკს, მიიღებს პრიზს!\n\n${descText}`)
            .setFooter({ text: `დააგდო: ${message.author.username}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`claim_drop_${type}_${value}`)
                .setLabel('🎁 გახსნა / Claim')
                .setStyle(ButtonStyle.Success)
        );

        return message.channel.send({ embeds: [dropEmbed], components: [row] });
    }

    // 7. /ns pay
    if (command === 'pay') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!target || target.id === userId || target.bot || !amount || isNaN(amount) || amount <= 0) {
            return message.reply('❌ გამოიყენე: `/ns pay @user <თანხა>`');
        }
        if (userBalances[userId] < amount) {
            return message.reply(`❌ არ გაქვს საკმარისი ბალანსი!`);
        }

        if (!userBalances[target.id]) userBalances[target.id] = 1000;

        userBalances[userId] -= amount;
        userBalances[target.id] += amount;
        saveDatabase();

        const payCard = await tryCard(() => cardPay(message.author, target, amount), 'pay.png');
        if (payCard) return message.reply({ content: `${target}`, files: [payCard] });

        return message.reply(`💸 წარმატებით გადაურიცხე ${target}-ს **${amount.toLocaleString()}** ქოინი!`);
    }

    // 8. /ns top
    if (command === 'top' || command === 'lb' || command === 'leaderboard') {
        const type = args[0]?.toLowerCase();

        if (type === 'lvl' || type === 'level') {
            const sortedLvl = Object.entries(userLevel).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const lvlCard = await tryCard(async () => {
                const rows = [];
                for (const [uId, lv] of sortedLvl) {
                    const u = await getUser(uId);
                    rows.push({ user: u, name: u ? u.username : 'Unknown', value: `LVL ${lv}  |  ${fmt(userXP[uId] || 0)} XP` });
                }
                return cardTop('TOP 10 - HIGHEST LEVELS', rows);
            }, 'top.png');
            if (lvlCard) return message.reply({ files: [lvlCard] });
            let desc = '';

            for (let i = 0; i < sortedLvl.length; i++) {
                const [uId, lvl] = sortedLvl[i];
                desc += `**#${i + 1}** <@${uId}> — **LVL ${lvl}** (${(userXP[uId] || 0).toLocaleString()} XP)\n`;
            }

            const topEmbed = new EmbedBuilder()
                .setTitle('🏆 TOP 10 - ყველაზე მაღალი ლეველები')
                .setColor('#f59e0b')
                .setDescription(desc || 'მონაცემები ჯერ არ არის.');

            return message.reply({ embeds: [topEmbed] });
        } else {
            const sortedBal = Object.entries(userBalances).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const balCard = await tryCard(async () => {
                const rows = [];
                for (const [uId, b] of sortedBal) {
                    const u = await getUser(uId);
                    rows.push({ user: u, name: u ? u.username : 'Unknown', value: fmt(b) });
                }
                return cardTop('TOP 10 - RICHEST PLAYERS', rows);
            }, 'top.png');
            if (balCard) return message.reply({ files: [balCard] });
            let desc = '';

            for (let i = 0; i < sortedBal.length; i++) {
                const [uId, bal] = sortedBal[i];
                desc += `**#${i + 1}** <@${uId}> — **${bal.toLocaleString()}** 💰\n`;
            }

            const topEmbed = new EmbedBuilder()
                .setTitle('💰 TOP 10 - ყველაზე მდიდარი მოთამაშეები')
                .setColor('#10b981')
                .setDescription(desc || 'მონაცემები ჯერ არ არის.');

            return message.reply({ embeds: [topEmbed] });
        }
    }

    // 9. /ns daily
    if (command === 'daily') {
        const lastDaily = userCooldowns[`daily_${userId}`];
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (lastDaily && now - lastDaily < cooldown) {
            const remaining = Math.ceil((cooldown - (now - lastDaily)) / (1000 * 60 * 60));
            return message.reply(`❌ ყოველდღიური ჯილდო უკვე აღებული გაქვს! დარჩენილია: **${remaining} საათი**.`);
        }

        const rewardMoney = 5000;
        const rewardXP = 200;

        userBalances[userId] += rewardMoney;
        if (addXP(userId, rewardXP)) {
            announceLevelUp(message.channel, message.author, userLevel[userId]);
        }

        userCooldowns[`daily_${userId}`] = now;
        saveDatabase();

        const dailyCard = await tryCard(() => cardDaily(message.author, rewardMoney, rewardXP, userBalances[userId]), 'daily.png');
        if (dailyCard) return message.reply({ files: [dailyCard] });

        return message.reply(`🎉 წარმატებით აიღე ყოველდღიური ჯილდო: **${rewardMoney.toLocaleString()}** ქოინი და **+${rewardXP} XP**! ✨`);
    }

    // 10. /ns spin — სლოტ-მანქანის ანიმაცია
    if (command === 'spin') {
        const cost = 1000;
        if (userBalances[userId] < cost) {
            return message.reply(`❌ ბორბლის დასატრიალებლად გჭირდება მინიმუმ **${cost.toLocaleString()}** ქოინი!`);
        }

        // ფასი ჩამოიჭრება წინასწარ (ანიმაციის დროს ბალანსის გამოყენება აღარ იქნება შესაძლებელი)
        userBalances[userId] -= cost;
        saveDatabase();

        const symbols = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];
        const win = Math.random() < 0.5;
        const prize = win ? Math.floor(Math.random() * 6000) + 2000 : 0;

        // საბოლოო სვეტები: მოგებისას 3 ერთნაირი, წაგებისას არა
        let final;
        if (win) {
            const s = pick(symbols);
            final = [s, s, s];
        } else {
            final = [pick(symbols), pick(symbols), pick(symbols)];
            while (final[0] === final[1] && final[1] === final[2]) final[2] = pick(symbols);
        }

        const SPIN = '🌀';
        const render = (cols, footer, color) =>
            new EmbedBuilder()
                .setColor(color)
                .setTitle('🎰 NEMO SLOTS')
                .setDescription(`**${message.author.username}** დახარჯა **${cost.toLocaleString()}** 💰\n\n` +
                    `┃ ${cols[0]} ┃ ${cols[1]} ┃ ${cols[2]} ┃\n\n${footer}`);

        const spinMsg = await message.reply({ embeds: [render([SPIN, SPIN, SPIN], '🔄 *ბრუნავს...*', '#f59e0b')] });

        // ეტაპები: რენდომი, რენდომი, 1-ლი ჩერდება, მე-2 ჩერდება, მე-3 ჩერდება
        const stages = [0, 0, 1, 2, 3];
        for (const locked of stages) {
            await sleep(800);
            const cols = [0, 1, 2].map((i) => (i < locked ? final[i] : pick(symbols)));
            if (locked < 3) {
                await spinMsg.edit({ embeds: [render(cols, '🔄 *ბრუნავს...*', '#f59e0b')] }).catch(() => {});
            }
        }

        let leveled = false;
        if (win) userBalances[userId] += prize;
        leveled = addXP(userId, 50);
        saveDatabase();

        const footer = win
            ? `🎉 **გილოცავ!** მოიგე **${prize.toLocaleString()}** ქოინი და **+50 XP**!`
            : `😢 სამწუხაროდ წააგე **${cost.toLocaleString()}** ქოინი, მაგრამ მიიღე **+50 XP**.`;

        const slotCard = await tryCard(() => cardSlots(message.author, final.map((x) => symbols.indexOf(x)), win, win ? prize : cost, userBalances[userId], 50), 'spin.png');
        if (slotCard) await spinMsg.edit({ content: '', embeds: [], files: [slotCard] }).catch(() => {});
        else await spinMsg.edit({ embeds: [render(final, footer + `\n💰 ბალანსი: **${userBalances[userId].toLocaleString()}**`, win ? '#22c55e' : '#ef4444')] }).catch(() => {});

        if (leveled) {
            announceLevelUp(message.channel, message.author, userLevel[userId]);
        }
        return;
    }

    // 11. /ns cf — მონეტის ანიმაცია
    if (command === 'cf' || command === 'coinflip') {
        const betArg = args[0]?.toLowerCase();
        const userBal = userBalances[userId] || 0;

        if (userBal <= 0) {
            return message.reply('❌ შენ არ გაქვს მონეტები ბალანსზე!');
        }

        const bet = betArg === 'all' ? userBal : parseInt(betArg);

        if (!bet || isNaN(bet) || bet <= 0 || userBal < bet) {
            return message.reply('❌ გამოიყენე: `/ns cf 5000` ან `/ns cf all`');
        }

        // ფსონი ჩამოიჭრება წინასწარ, რომ ანიმაციის დროს სპამით ვერავინ გამოიყენოს ერთი და იგივე ბალანსი
        userBalances[userId] -= bet;
        saveDatabase();

        const win = Math.random() < 0.5;
        const side = win ? '👑 თავი' : '🦅 კუდი';

        const head = `**${message.author.username}** დახარჯა **${bet.toLocaleString()}** 💰`;
        const frames = [
            '🪙 ⠀ ⠀ ⠀ ⠀ *მონეტა ჰაერში ადის...*',
            '⠀ 🪙 ⠀ ⠀ ⠀ *ბრუნავს...*',
            '⠀ ⠀ 🪙 ⠀ ⠀ *ბრუნავს...*',
            '⠀ ⠀ ⠀ 🪙 ⠀ *ეცემა...*',
            '⠀ ⠀ ⠀ ⠀ 🪙 *ეცემა...*'
        ];

        const cfMsg = await message.reply(`${head}\n\n${frames[0]}`);

        for (let i = 1; i < frames.length; i++) {
            await sleep(700);
            await cfMsg.edit(`${head}\n\n${frames[i]}`).catch(() => {});
        }
        await sleep(700);

        if (win) userBalances[userId] += bet * 2;
        const leveled = addXP(userId, 40);
        saveDatabase();

        const result = win
            ? `🪙 ➜ **${side}**\n🎉 შენ მოიგე **${bet.toLocaleString()}** ქოინი და **+40 XP**!`
            : `🪙 ➜ **${side}**\n💥 სამწუხაროდ წააგე **${bet.toLocaleString()}** ქოინი, მაგრამ მიიღე **+40 XP**.`;

        const coinCard = await tryCard(() => cardCoin(message.author, bet, win, userBalances[userId], 40), 'cf.png');
        if (coinCard) await cfMsg.edit({ content: '', files: [coinCard] }).catch(() => {});
        else await cfMsg.edit(`${head}\n\n${result}\n💰 ბალანსი: **${userBalances[userId].toLocaleString()}**`).catch(() => {});

        if (leveled) {
            announceLevelUp(message.channel, message.author, userLevel[userId]);
        }
        return;
    }

    // 12. /ns duel
    if (command === 'duel') {
        const opponent = message.mentions.users.first();
        const bet = parseInt(args[1]);

        if (!opponent || opponent.id === message.author.id || opponent.bot || !bet || isNaN(bet) || bet <= 0) {
            return message.reply('❌ გამოიყენე: `/ns duel @user <თანხა>`');
        }
        if (userBalances[userId] < bet) {
            return message.reply('❌ შენ არ გაქვს საკმარისი თანხა!');
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`duel_accept_${userId}_${opponent.id}_${bet}`).setLabel('Accept (მიღება)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`duel_decline_${userId}_${opponent.id}`).setLabel('Decline (უარყოფა)').setStyle(ButtonStyle.Danger)
        );

        return message.reply({
            content: `⚔️ ${opponent}, ${message.author}-მა გამოგიწვია დუელში **${bet.toLocaleString()}** ქოინზე!`,
            components: [row]
        });
    }

    // 13. /ns addm
    if (command === 'addm') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ მხოლოდ ადმინისტრატორებისთვის!');
        }
        const target = message.mentions.users.first();
        const amount = parseInt(args[1]);
        if (!target || !amount || isNaN(amount)) return message.reply('❌ გამოიყენე: `/ns addm @user <თანხა>`');

        if (!userBalances[target.id]) userBalances[target.id] = 1000;
        userBalances[target.id] += amount;
        saveDatabase();

        return message.reply(`✅ დაერიცხა **${amount.toLocaleString()}** ქოინი.`);
    }

    // 14. /ns zero
    if (command === 'zero') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ მხოლოდ ადმინისტრატორებისთვის!');
        }
        const target = message.mentions.users.first();
        const amountArg = args[1]?.toLowerCase();
        if (!target || !amountArg) return message.reply('❌ გამოიყენე: `/ns zero @user <თანხა>` ან `all`');

        if (!userBalances[target.id]) userBalances[target.id] = 1000;

        if (amountArg === 'all') {
            userBalances[target.id] = 0;
            saveDatabase();
            return message.reply(`⚠️ ბალანსი განულდა.`);
        }

        const amount = parseInt(amountArg);
        userBalances[target.id] = Math.max(0, userBalances[target.id] - amount);
        saveDatabase();

        return message.reply(`🔻 ჩამოეჭრა **${amount.toLocaleString()}** ქოინი.`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('claim_drop_')) {
        const [, , type, value] = interaction.customId.split('_');
        const userId = interaction.user.id;

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('claimed')
                .setLabel('🎁 უკვე აღებულია!')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        if (!userBalances[userId]) userBalances[userId] = 1000;
        if (!userXP[userId]) userXP[userId] = 0;
        if (!userLevel[userId]) userLevel[userId] = 1;

        if (type === 'money') {
            const amt = parseInt(value);
            userBalances[userId] += amt;
            saveDatabase();
            await interaction.update({
                content: `🎉 ${interaction.user}-მა პირველმა გახსნა ყუთი და მოიგო **${amt.toLocaleString()}** ქოინი! 💰`,
                components: [disabledRow]
            });
        } else if (type === 'xp') {
            const amt = parseInt(value);
            addXP(userId, amt);
            saveDatabase();
            await interaction.update({
                content: `🎉 ${interaction.user}-მა პირველმა გახსნა ყუთი და მიიღო **${amt.toLocaleString()} XP**! ⭐`,
                components: [disabledRow]
            });
        } else if (type === 'role') {
            const item = shopRoles[value];
            if (!item) {
                return interaction.reply({ content: '❌ აღნიშნული როლი ვერ მოიძებნა!', ephemeral: true });
            }

            try {
                if (item.isVip) {
                    const now = Date.now();
                    const expiresAt = now + (item.days * 24 * 60 * 60 * 1000);
                    activeVips[userId] = {
                        roleId: item.roleId,
                        expiresAt: expiresAt
                    };
                }

                await interaction.member.roles.add(item.roleId);
                saveDatabase();

                await interaction.update({
                    content: `🎉 ${interaction.user}-მა პირველმა გახსნა ყუთი და მიიღო როლი **${item.name}**! 👑`,
                    components: [disabledRow]
                });
            } catch (err) {
                await interaction.reply({ content: '❌ ბოტს არ აქვს საკმარისი უფლება ამ როლის მისანიჭებლად!', ephemeral: true });
            }
        }
        return;
    }

    const [action, type, challengerId, opponentId, bet] = interaction.customId.split('_');

    if (action === 'duel') {
        if (interaction.user.id !== opponentId) {
            return interaction.reply({ content: '❌ ეს დუელი შენ არ გეხება!', ephemeral: true });
        }
        if (type === 'decline') {
            return interaction.update({ content: '❌ დუელზე უარი ითქვა.', components: [] });
        }
        if (type === 'accept') {
            const betAmount = parseInt(bet);
            if ((userBalances[opponentId] || 1000) < betAmount) {
                return interaction.update({ content: '❌ მოწინააღმდეგეს არ აქვს საკმარისი ბალანსი!', components: [] });
            }

            await interaction.update({ content: `⚔️ **დუელი მიმდინარეობს...** 🗡️`, components: [] });

            setTimeout(async () => {
                const winner = Math.random() < 0.5 ? challengerId : opponentId;
                const loser = winner === challengerId ? opponentId : challengerId;

                if (!userBalances[winner]) userBalances[winner] = 1000;
                if (!userBalances[loser]) userBalances[loser] = 1000;
                if (!userXP[winner]) userXP[winner] = 0;
                if (!userLevel[winner]) userLevel[winner] = 1;

                userBalances[winner] += betAmount;
                userBalances[loser] -= betAmount;
                addXP(winner, 100);

                saveDatabase();

                const wu = await getUser(winner), lu = await getUser(loser);
                const duelCard = wu && lu ? await tryCard(() => cardDuel(wu, lu, betAmount, 100), 'duel.png') : null;
                if (duelCard) return interaction.editReply({ content: `<@${winner}>`, files: [duelCard] });

                await interaction.editReply({
                    content: `⚔️ **დუელი დასრულდა!**\n🏆 გამარჯვებულია <@${winner}>! მან მოიგო **${betAmount.toLocaleString()}** ქოინი და **+100 XP**! 💰`
                });
            }, 3000);
        }
    }
});

client.login(process.env.TOKEN);
