// ตั้งค่าร้านแบบไดนามิก (แก้ได้จากหน้า /admin.html เมนูตั้งค่า)
const DEFAULT_SETTINGS = {
  theme: { preset: "cha", bg: "#f7f1e6", brand: "#9c7248", brandStrong: "#7c5836", accent: "#c8973a" },
  shipping: {
    provider: "ไปรษณีย์ไทย",
    pickup_enabled: true,
    pickup_note: "",
    tracking_url: "https://track.thailandpost.com/?track={tracking}",
  },
  email: { notify_paid: true, notify_shipped: true },
  line: { group_enabled: false, individual_enabled: false, group_ids: [], channel_access_token: "", channel_secret: "" },
};

export async function getSettings(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'shop'`).first();
  if (!row) return structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(row.value);
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(env, next) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('shop', ?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2`
  ).bind(JSON.stringify(next), Date.now()).run();
}

export function publicTheme(settings) {
  const t = settings.theme || DEFAULT_SETTINGS.theme;
  return { preset: t.preset, bg: t.bg, brand: t.brand, brandStrong: t.brandStrong, accent: t.accent };
}

// ข้อมูลที่ส่งกลับให้หน้า admin (ปกปิด token/secret)
export function publicSettings(s) {
  return {
    theme: s.theme,
    shipping: s.shipping,
    email: s.email,
    line: {
      group_enabled: Boolean(s.line.group_enabled),
      individual_enabled: Boolean(s.line.individual_enabled),
      group_ids: Array.isArray(s.line.group_ids) ? s.line.group_ids : [],
      has_token: Boolean(s.line.channel_access_token),
      has_secret: Boolean(s.line.channel_secret),
    },
  };
}
