import { supabase } from "./supabase";

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

function mapPreferencesRow(row) {
  if (!row) {
    return {
      customCategories: [],
      categoryRenames: {},
      categoryEmojiOverrides: {},
      permanentlyDismissed: [],
      aiInsights: [],
    };
  }

  return {
    customCategories: Array.isArray(row.custom_categories)
      ? row.custom_categories
      : [],
    categoryRenames:
      row.category_renames && typeof row.category_renames === "object"
        ? row.category_renames
        : {},
    categoryEmojiOverrides:
      row.category_emoji_overrides &&
      typeof row.category_emoji_overrides === "object"
        ? row.category_emoji_overrides
        : {},
    permanentlyDismissed: Array.isArray(row.permanently_dismissed)
      ? row.permanently_dismissed
      : [],
    aiInsights: Array.isArray(row.ai_insights) ? row.ai_insights : [],
  };
}

export async function getUserPreferences() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return mapPreferencesRow(null);
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getUserPreferences error:", error.message);
    return mapPreferencesRow(null);
  }

  return mapPreferencesRow(data);
}

export async function saveUserPreferences(updates = {}) {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const payload = { user_id: user.id };

  if (updates.customCategories !== undefined) {
    payload.custom_categories = updates.customCategories;
  }
  if (updates.categoryRenames !== undefined) {
    payload.category_renames = updates.categoryRenames;
  }
  if (updates.categoryEmojiOverrides !== undefined) {
    payload.category_emoji_overrides = updates.categoryEmojiOverrides;
  }
  if (updates.permanentlyDismissed !== undefined) {
    payload.permanently_dismissed = updates.permanentlyDismissed;
  }
  if (updates.aiInsights !== undefined) {
    payload.ai_insights = updates.aiInsights;
  }

  if (Object.keys(payload).length === 1) return true;

  const { error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("saveUserPreferences error:", error.message);
    return false;
  }

  return true;
}
