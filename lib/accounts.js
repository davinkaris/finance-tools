import { supabase } from "./supabase";

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("getAuthenticatedUser error:", error.message);
    return null;
  }

  return user;
}

function mapAccountRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    nama: row.nama,
    tipe: row.tipe,
    bank: row.bank,
    warna: row.warna,
    createdAt: row.created_at,
  };
}

export async function getAccounts() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getAccounts error:", error.message);
    return [];
  }

  return (data || []).map(mapAccountRow).filter(Boolean);
}

export async function getAccountById(id) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getAccountById error:", error.message);
    return null;
  }

  return mapAccountRow(data);
}

export async function saveAccount(account) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const payload = {
    id: account.id || generateId(),
    user_id: user.id,
    nama: String(account.nama || "").trim(),
    tipe: account.tipe === "cc" ? "cc" : "bank",
    bank: String(account.bank || "").trim(),
    warna: String(account.warna || "#3B82F6").trim(),
    created_at: account.createdAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("accounts")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("saveAccount error:", error.message);
    return null;
  }

  return mapAccountRow(data);
}

export async function updateAccount(id, data) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const current = await getAccountById(id);
  if (!current) return null;

  const updatePayload = {};

  if (data.nama !== undefined) {
    updatePayload.nama = String(data.nama).trim();
  }
  if (data.bank !== undefined) {
    updatePayload.bank = String(data.bank).trim();
  }
  if (data.warna !== undefined) {
    updatePayload.warna = String(data.warna).trim();
  }
  if (data.tipe === "cc" || data.tipe === "bank") {
    updatePayload.tipe = data.tipe;
  }

  const { data: row, error } = await supabase
    .from("accounts")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    console.error("updateAccount error:", error.message);
    return null;
  }

  return mapAccountRow(row);
}

export async function deleteAccount(id) {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("deleteAccount error:", error.message);
    return false;
  }

  return (data || []).length > 0;
}
