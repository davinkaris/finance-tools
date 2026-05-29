import { generateId } from "./accounts";
import { supabase } from "./supabase";

export async function getProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getProfile error:", error.message);
    return null;
  }

  return data;
}

export async function isOnboardingCompleted(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;
  return data?.onboarding_completed === true;
}

export async function completeOnboarding({
  userId,
  userEmail,
  profileData,
  accountData,
}) {
  const accountId = generateId();
  const birthDate =
    profileData.birthYear &&
    profileData.birthMonth &&
    profileData.birthDay
      ? `${profileData.birthYear}-${String(profileData.birthMonth).padStart(2, "0")}-${String(profileData.birthDay).padStart(2, "0")}`
      : null;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: userEmail || null,
      full_name: profileData.fullName.trim(),
      birth_date: birthDate,
      gender: profileData.gender || null,
      occupation: profileData.occupation || null,
      income_range: profileData.incomeRange || null,
      onboarding_completed: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return { accountId: null, error: profileError };
  }

  const { error: accountError } = await supabase.from("accounts").insert({
    id: accountId,
    user_id: userId,
    nama: accountData.nama.trim(),
    tipe: "bank",
    bank: accountData.bank,
    warna: accountData.warna,
    created_at: new Date().toISOString(),
  });

  if (accountError) {
    return { accountId: null, error: accountError };
  }

  return { accountId, error: null };
}
