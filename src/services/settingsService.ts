import { createClient } from "@/utils/supabase/client";

export const SettingsService = {
    async getSetting(key: string) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', key)
            .single();

        if (error) {
            console.error(`Error fetching setting ${key}:`, error);
            return null;
        }

        return data?.value;
    },

    async updateSetting(key: string, value: any) {
        const supabase = createClient();
        const { error } = await supabase
            .from('site_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() });

        if (error) {
            console.error(`Error updating setting ${key}:`, error);
            throw error;
        }
    }
};
